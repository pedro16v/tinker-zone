// Time machine — reads every deployed batch (and its originating prompts) from Supabase
// using the anon key, and links each one to its immutable per-deploy URL. The data is
// already in `batches` + `live_patches` (RLS allows anon SELECT on both).

const cfg = window.TZ_CONFIG;
const SBR = cfg && `${cfg.supabaseUrl}/rest/v1`;
const HEADERS = cfg && {
  apikey: cfg.supabaseAnonKey,
  authorization: `Bearer ${cfg.supabaseAnonKey}`,
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function api(path) {
  const res = await fetch(`${SBR}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json();
}

(async () => {
  const list = document.getElementById("history-list");
  const meta = document.getElementById("history-meta");
  if (!cfg) {
    meta.textContent = "configuration missing";
    return;
  }
  try {
    const batches = await api(
      `/batches?select=id,created_at,deployed_at,deploy_url&status=eq.deployed&order=deployed_at.desc&limit=100`,
    );
    if (!batches.length) {
      meta.textContent =
        "No deployed bakes yet — the site hasn't evolved through the bake pipeline.";
      return;
    }
    meta.textContent = `${batches.length} version${batches.length === 1 ? "" : "s"} so far. Newest first.`;

    const allPatches = await Promise.all(
      batches.map((b) =>
        api(`/live_patches?select=seq,prompt&batch_id=eq.${b.id}&order=seq`).catch(() => []),
      ),
    );

    batches.forEach((b, i) => {
      const li = document.createElement("li");
      const dt = b.deployed_at ? new Date(b.deployed_at) : new Date(b.created_at);
      const dateStr = dt.toLocaleString();
      const prompts = allPatches[i] || [];
      const promptsHTML = prompts.length
        ? `<ol class="prompts">${prompts
            .map(
              (p) =>
                `<li>${
                  p.prompt ? esc(p.prompt) : "<em>(no prompt recorded)</em>"
                }</li>`,
            )
            .join("")}</ol>`
        : '<p class="prompts-empty">no prompts recorded</p>';
      li.innerHTML = `
        <details>
          <summary><time>${esc(dateStr)}</time> <span class="muted">— ${prompts.length} prompt${
            prompts.length === 1 ? "" : "s"
          }</span></summary>
          ${promptsHTML}
          ${
            b.deploy_url
              ? `<a class="open" href="${esc(b.deploy_url)}" target="_blank" rel="noopener">open this version &rarr;</a>`
              : ""
          }
        </details>
      `;
      list.appendChild(li);
    });
  } catch (e) {
    meta.textContent = `couldn't load history: ${esc(String(e))}`;
  }
})();
