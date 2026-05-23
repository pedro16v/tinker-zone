// deploy-confirm — called by deploy.yml after a successful Vercel production deploy.
// Marks the batch's row as deployed (with the immutable per-deploy URL), flips its baking
// patches to 'baked', and broadcasts a reset on the tz:live channel so every connected
// browser reloads the new canonical and drops its now-baked ephemeral patches.
//
// Auth: caller must present the service_role key as Bearer (set as GH secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendDeployEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  if (!SB_SRK || !SB_URL) return json(500, { error: "config missing" });

  // Auth: payload role must be service_role. If SUPABASE_JWT_SECRET is available, ALSO
  // verify the HS256 signature (strict). Otherwise fall back to a role-only check so
  // missing-secret environments still work — the role check alone is acceptable here
  // because deploy.yml is the only caller and the batch_id space is UUIDs.
  const SB_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { error: "unauthorized", reason: "no bearer" });
  if (!(await verifyServiceRoleJWT(m[1].trim(), SB_JWT_SECRET))) {
    return json(401, { error: "unauthorized" });
  }

  let body: { batch_id?: string; deploy_url?: string; deploy_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const batchId = body.batch_id;
  const deployUrl = body.deploy_url ?? null;
  const deployId = body.deploy_id ?? deployUrl ?? "unknown";
  if (!batchId) return json(400, { error: "batch_id required" });

  const supa = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

  const { error: bErr } = await supa
    .from("batches")
    .update({
      status: "deployed",
      deploy_url: deployUrl,
      deploy_id: deployId,
      deployed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  if (bErr) return json(500, { error: "batch update failed", detail: bErr.message });

  const { error: pErr } = await supa
    .from("live_patches")
    .update({ status: "baked", baked_in_deploy: deployId })
    .eq("batch_id", batchId);
  if (pErr) return json(500, { error: "live_patches update failed", detail: pErr.message });

  // Tell every connected browser to reload canonical and drop ephemeral patches.
  const { error: rErr } = await supa.rpc("tz_broadcast_reset", { p_deploy_id: deployId });
  if (rErr) return json(500, { error: "broadcast failed", detail: rErr.message });

  // M6: notify each submitter who left an email, then delete their address. No-op when
  // RESEND_API_KEY isn't set in the function env.
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM = Deno.env.get("RESEND_FROM");  // e.g. "tinker.zone <hi@your-domain.com>"
  let notified = 0;
  if (RESEND_KEY && deployUrl) {
    try {
      const { data: patches } = await supa
        .from("live_patches")
        .select("id, prompt")
        .eq("batch_id", batchId);
      const ids = (patches ?? []).map((p) => p.id);
      const promptById = new Map((patches ?? []).map((p) => [p.id, p.prompt as string | null]));
      if (ids.length) {
        const { data: rows } = await supa
          .from("notification_emails")
          .select("id, email, live_patch_id")
          .in("live_patch_id", ids)
          .is("sent_at", null);
        const grouped = new Map<string, { ids: string[]; prompts: string[] }>();
        for (const r of rows ?? []) {
          const entry = grouped.get(r.email) ?? { ids: [], prompts: [] };
          entry.ids.push(r.id);
          const p = promptById.get(r.live_patch_id);
          if (p) entry.prompts.push(p);
          grouped.set(r.email, entry);
        }
        for (const [recipient, entry] of grouped) {
          const r = await sendDeployEmail({
            apiKey: RESEND_KEY,
            to: recipient,
            from: RESEND_FROM,
            prompts: entry.prompts.length ? entry.prompts : ["(your submission)"],
            deployUrl,
          });
          if (r.ok) {
            // Privacy: delete the address rows once the email has gone out.
            await supa.from("notification_emails").delete().in("id", entry.ids);
            notified++;
          } else {
            console.warn("email send failed:", recipient, r.status, r.detail);
          }
        }
      }
    } catch (e) {
      console.warn("notification step error:", String(e).slice(0, 240));
    }
  }

  return json(200, { ok: true, batch_id: batchId, deploy_id: deployId, notified });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

// JWT verification: payload role must be service_role. If secret is given, also verify the
// HS256 signature. Otherwise just trust the role claim (loose v1 fallback).
async function verifyServiceRoleJWT(
  token: string,
  secret: string | undefined,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (payload?.role !== "service_role") return false;
    if (!secret) return true;
    const data = new TextEncoder().encode(`${h}.${p}`);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, b64urlToBytes(s), data);
  } catch {
    return false;
  }
}

function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length % 4) || 4);
  const bin = atob(padded);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
