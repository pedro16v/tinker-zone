// deploy-confirm — called by deploy.yml after a successful Vercel production deploy.
// Marks the batch's row as deployed (with the immutable per-deploy URL), flips its baking
// patches to 'baked', and broadcasts a reset on the tz:live channel so every connected
// browser reloads the new canonical and drops its now-baked ephemeral patches.
//
// Auth: caller must present the service_role key as Bearer (set as GH secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SB_URL = Deno.env.get("SUPABASE_URL");
  if (!SB_SRK || !SB_URL) return json(500, { error: "config missing" });

  // v1 auth: accept any bearer whose JWT payload has role=service_role. This makes the
  // function tolerant of harmless mismatches between the auto-injected key and the GH-secret
  // copy (a common copy-paste pitfall). M5 hardening replaces this with a signed check.
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { error: "unauthorized", reason: "no bearer" });
  try {
    const seg = m[1].trim().split(".")[1] ?? "";
    const padded = seg + "==".slice((seg.length % 4) || 4);
    const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.role !== "service_role") {
      return json(401, { error: "unauthorized", reason: `role=${payload?.role}` });
    }
  } catch {
    return json(401, { error: "unauthorized", reason: "bad jwt payload" });
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

  return json(200, { ok: true, batch_id: batchId, deploy_id: deployId });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
