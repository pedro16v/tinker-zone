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

  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return json(400, { error: "empty prompt" });
  if (prompt.length > 500) return json(400, { error: "prompt too long (max 500)" });

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

  // Per-IP rate limit (5 submissions / hour). Supabase's edge may set any of these headers;
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
    const { error } = await supa.from("live_patches").insert({ patch: fakePatch });
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

  // Patch generation
  let patch: unknown;
  try {
    patch = await patchgen(ANTHROPIC, prompt);
  } catch (e) {
    return json(200, {
      ok: false,
      reason: "couldn't express that as a live patch yet (it'll ride into the next bake)",
      detail: String(e).slice(0, 400),
    });
  }

  // Validate (authoritative — never trust the wire)
  const v = validatePatch(patch);
  if (!v.ok) {
    return json(200, {
      ok: false,
      reason: "patch rejected by validator",
      errors: v.errors,
    });
  }

  // Insert: the broadcast trigger fans it out to every connected browser within a second.
  const { error } = await supa.from("live_patches").insert({ patch });
  if (error) return json(500, { error: "insert failed", detail: error.message });

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
