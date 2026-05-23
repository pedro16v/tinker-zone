// Resend integration. No-ops cleanly when RESEND_API_KEY isn't set in the function env, so
// nothing breaks until you wire up an account.

const RESEND = "https://api.resend.com/emails";

export async function sendDeployEmail(opts: {
  apiKey: string;
  to: string;
  from?: string;
  prompts: string[];
  deployUrl: string;
}): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const subject = "your change to tinker.zone is live";
  const list = opts.prompts.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  const html =
    `<p>Your prompt${opts.prompts.length > 1 ? "s" : ""}:</p>` +
    `<ul>${list}</ul>` +
    `<p>See it live: <a href="${escapeHtml(opts.deployUrl)}">${escapeHtml(opts.deployUrl)}</a></p>` +
    `<p><small>The email address you provided has now been deleted from the database.</small></p>`;
  const text =
    `Your prompt${opts.prompts.length > 1 ? "s" : ""}: ${opts.prompts.join(" | ")}\n\n` +
    `See it live: ${opts.deployUrl}\n\n(Your email address has been deleted.)`;

  const res = await fetch(RESEND, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from ?? "tinker.zone <onboarding@resend.dev>",
      to: opts.to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 240);
    } catch {}
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, status: res.status };
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
