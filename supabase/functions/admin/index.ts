// /admin — privileged operations callable with a service-role bearer JWT.
//
// Single POST endpoint with a body { action, ...params }. Actions:
//   - "status"        → returns control row + recent batches.
//   - "kill"          → submissions_open = false.
//   - "resume"        → submissions_open = true.
//   - "set_staging"   → { on: boolean } → staging_mode flag.
//   - "set_spend_cap" → { cents: int } → spend_cap_cents.
//   - "fail_batch"    → { batch_id, error? } → release a batch's patches back to 'live'.
//   - "force_reset"   → { deploy_id? } → broadcast a {type:'reset'} on tz:live so all
//                       browsers reload the current canonical.
//
// Auth: HS256 JWT signed by the project's JWT secret, payload.role = service_role. If
// SUPABASE_JWT_SECRET isn't present in the function env, falls back to a role-only check.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SB_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!SB_URL || !SB_SRK) return json(500, { error: "config missing" });

  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { error: "unauthorized", reason: "no bearer" });
  const token = m[1].trim();
  if (!(await verifyJWT(token, SB_JWT_SECRET))) {
    return json(401, { error: "unauthorized" });
  }

  let body: { action?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }
  const action = String(body.action ?? "");
  const supa = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

  switch (action) {
    case "status": {
      const { data: ctrl } = await supa
        .from("control")
        .select("submissions_open, staging_mode, spend_cap_cents, updated_at")
        .eq("id", 1)
        .maybeSingle();
      const { data: batches } = await supa
        .from("batches")
        .select("id, status, created_at, deployed_at, deploy_url, github_issue, error")
        .order("created_at", { ascending: false })
        .limit(10);
      return json(200, { ok: true, control: ctrl, recent_batches: batches });
    }
    case "kill":
    case "resume": {
      const open = action === "resume";
      const { error } = await supa
        .from("control")
        .update({ submissions_open: open, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return json(500, { error: "update failed", detail: error.message });
      return json(200, { ok: true, submissions_open: open });
    }
    case "set_staging": {
      const on = !!body.on;
      const { error } = await supa
        .from("control")
        .update({ staging_mode: on, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return json(500, { error: "update failed", detail: error.message });
      return json(200, { ok: true, staging_mode: on });
    }
    case "set_spend_cap": {
      const cents = Number(body.cents);
      if (!Number.isInteger(cents) || cents < 0) {
        return json(400, { error: "cents must be a non-negative integer" });
      }
      const { error } = await supa
        .from("control")
        .update({ spend_cap_cents: cents, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) return json(500, { error: "update failed", detail: error.message });
      return json(200, { ok: true, spend_cap_cents: cents });
    }
    case "fail_batch": {
      const batchId = String(body.batch_id ?? "");
      if (!batchId) return json(400, { error: "batch_id required" });
      const { error } = await supa.rpc("fail_batch", {
        p_batch_id: batchId,
        p_error: String(body.error ?? "manual admin fail"),
      });
      if (error) return json(500, { error: "rpc failed", detail: error.message });
      return json(200, { ok: true, batch_id: batchId });
    }
    case "force_reset": {
      const deployId = String(body.deploy_id ?? "manual");
      const { error } = await supa.rpc("tz_broadcast_reset", { p_deploy_id: deployId });
      if (error) return json(500, { error: "rpc failed", detail: error.message });
      return json(200, { ok: true, deploy_id: deployId });
    }
    default:
      return json(400, { error: `unknown action: ${action || "(empty)"}` });
  }
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

// Verify that the bearer is a service-role JWT. If a JWT secret is available, also verify
// the HS256 signature (strict). Otherwise fall back to a role-only payload check (loose).
async function verifyJWT(token: string, secret: string | undefined): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (payload?.role !== "service_role") return false;
    if (!secret) return true;
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, b64urlToBytes(parts[2]), data);
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
