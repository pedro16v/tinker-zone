// Cloudflare Turnstile server-side token verification. Returns ok=true if the token is
// valid and bound to a real user-passed challenge.

const URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string,
  secret: string,
  ip?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (e) {
    return { ok: false, reason: `turnstile unreachable: ${String(e).slice(0, 120)}` };
  }
  if (!res.ok) return { ok: false, reason: `turnstile ${res.status}` };
  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "turnstile bad response" };
  }
  if (data.success) return { ok: true };
  const codes = (data["error-codes"] ?? []).join(",");
  return { ok: false, reason: codes || "rejected" };
}
