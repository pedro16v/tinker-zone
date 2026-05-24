// /submit — public Edge function. Receives a natural-language prompt, runs it through
// moderation → patch generation → shared validator → insert into live_patches. The insert
// fires a DB trigger that broadcasts on the public "tz:live" Realtime channel, so every
// connected browser applies the patch within a second.
//
// Trust model: this function has the service_role key (privileged); the client has only the
// anon key (RLS-bound, read-only on live_patches). All untrusted input flows through Haiku
// behind the moderation system prompt + the strict patch validator before reaching the DB.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { moderate } from "../_shared/moderation.ts";
import { patchgen } from "../_shared/patchgen.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
// The shared validator (single source of truth, also used by the browser).
import { validatePatch } from "../../../widget/patch-validator.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Diagnostic: dump request headers (opt-in via x-debug:headers). Lets us see what
  // Supabase's edge actually sets, e.g. for client-IP detection.
  if (req.headers.get("x-debug") === "headers") {
    const hs: Record<string, string> = {};
    for (const [k, v] of req.headers.entries()) hs[k] = v;
    return json(200, { headers: hs });
  }

  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!ANTHROPIC || !SB_URL || !SB_SRK) {
    return json(500, { error: "config missing", detail: "function env not set" });
  }

  let body: { prompt?: unknown; email?: unknown; turnstile_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return json(400, { error: "empty prompt" });
  if (prompt.length > 500) return json(400, { error: "prompt too long (max 500)" });

  // Optional email. Basic format check; the strict validation happens at the SMTP level.
  let email: string | null = null;
  const emailRaw = String(body.email ?? "").trim();
  if (emailRaw) {
    if (emailRaw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return json(400, { error: "bad email" });
    }
    email = emailRaw;
  }

  const supa = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

  // Kill switch + staging mode (M5 admin can flip these in the control table)
  const { data: ctrl } = await supa
    .from("control")
    .select("submissions_open, staging_mode")
    .eq("id", 1)
    .maybeSingle();
  if (ctrl && ctrl.submissions_open === false) {
    return json(503, { ok: false, reason: "submissions are paused" });
  }
  const stagingMode = ctrl?.staging_mode === true;

  // If Turnstile is configured (TURNSTILE_SECRET_KEY set), require a verified token. When
  // not configured we accept submissions without a token (v1 / pre-public).
  const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (TURNSTILE_SECRET) {
    const token = String(body.turnstile_token ?? "");
    if (!token) {
      return json(400, { ok: false, reason: "bot check token required" });
    }
    const ipForTs = (req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim());
    const tv = await verifyTurnstile(token, TURNSTILE_SECRET, ipForTs || undefined);
    if (!tv.ok) {
      return json(403, { ok: false, reason: `bot check failed${tv.reason ? ": " + tv.reason : ""}` });
    }
  }

  // Per-IP rate limit (50 / hour). Supabase's edge may set any of these headers;
  // try them in order, falling back to "unknown" only as a last resort.
  const ip = (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
  const ipHash = await sha256(ip);
  const { error: rlErr } = await supa.rpc("rate_check", {
    p_key: `submit:${ipHash}`,
    p_limit: 50, // generous for v1; M5 hardening tunes per-IP + per-domain windows
    p_window_seconds: 3600,
  });
  if (rlErr) {
    return json(429, {
      ok: false,
      reason: "slow down — try again in a bit",
      detail: { ip_detected: ip !== "unknown", hash_prefix: ipHash.slice(0, 8) },
    });
  }

  // Staging-mode short-circuit: return a canned approval + a benign patch, no Anthropic spend.
  if (stagingMode) {
    const fakePatch = { v: 1, ops: [{ op: "set_theme", theme: "dark" }] };
    const { error } = await supa.from("live_patches").insert({ patch: fakePatch, prompt });
    if (error) return json(500, { error: "insert failed", detail: error.message });
    return json(200, { ok: true, staging: true, patch: fakePatch });
  }

  // Moderation
  let mod;
  try {
    mod = await moderate(ANTHROPIC, prompt);
  } catch (e) {
    return json(502, { ok: false, reason: "moderation upstream error", detail: String(e).slice(0, 400) });
  }
  if (!mod.approved) {
    return json(200, { ok: false, reason: mod.reason ?? "not approved" });
  }

  // Patch generation. Two ways this can not produce a usable patch:
  //   (a) patchgen throws — model couldn't emit valid JSON, or upstream error
  //   (b) the patch parses but the validator rejects it (out-of-vocab op, unsafe selector, …)
  // Both cases used to drop the prompt on the floor. Now they queue it as bake_only so the
  // next bake batch picks it up and Claude Code implements the intent with full
  // /canvas/ expressiveness (real CSS, real JS, real layout — none of which the live
  // vocabulary can safely express).
  let patch: unknown;
  let bakeOnly = false;
  let bakeOnlyReason: string | null = null;
  let rejectedPatch: unknown = null;
  try {
    patch = await patchgen(ANTHROPIC, prompt);
  } catch (e) {
    bakeOnly = true;
    bakeOnlyReason = "patchgen couldn't produce a live patch";
    console.warn("patchgen threw, queueing bake_only:", String(e).slice(0, 200));
  }

  if (!bakeOnly) {
    const v = validatePatch(patch);
    if (!v.ok) {
      bakeOnly = true;
      bakeOnlyReason = "live vocabulary can't express this — queued for the next bake";
      rejectedPatch = patch;
      patch = null;
    }
  }

  if (bakeOnly) {
    const { data: inserted, error } = await supa
      .from("live_patches")
      .insert({ patch: null, prompt, status: "bake_only" })
      .select("id")
      .single();
    if (error) return json(500, { error: "insert failed", detail: error.message });
    if (email && inserted?.id) {
      const { error: eErr } = await supa
        .from("notification_emails")
        .insert({ live_patch_id: inserted.id, email });
      if (eErr) console.warn("notification_emails insert failed:", eErr.message);
    }
    // ok:true because the submission DID succeed — it's queued, not rejected. The widget
    // distinguishes bake_only from live via the queued_for_bake flag.
    return json(200, {
      ok: true,
      queued_for_bake: true,
      reason: bakeOnlyReason,
      // Surface the rejected patch (if any) as diagnostic; useful when iterating on prompts.
      rejected_patch: rejectedPatch,
    });
  }

  // Insert: store prompt alongside the patch (M4 batching uses the prompt in the bake issue
  // body). The broadcast trigger fans the patch out to every connected browser within a second.
  const { data: inserted, error } = await supa
    .from("live_patches")
    .insert({ patch, prompt })
    .select("id")
    .single();
  if (error) return json(500, { error: "insert failed", detail: error.message });

  // If the user gave an email, store it in a separate table (not anon-readable) so we can
  // notify them when the patch bakes.
  if (email && inserted?.id) {
    const { error: eErr } = await supa
      .from("notification_emails")
      .insert({ live_patch_id: inserted.id, email });
    if (eErr) console.warn("notification_emails insert failed:", eErr.message);
  }

  return json(200, { ok: true, patch });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
