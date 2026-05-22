import { initLiveLayer } from "./live-layer.js";

// tinker.zone widget — injected at build time from /widget, never from /canvas.
//
// Self-contained: no framework, no external requests. Lives in a CLOSED Shadow DOM attached
// to <html> (not <body>), so the canvas cannot style it, hide its parent, or remove it. A
// 2s self-heal loop re-asserts visibility/z-index/stacking if anything tries to cover it.
//
// M1 scope: present, visible, on-top, draggable, self-healing, with the submission UI shell.
// The submit handler is a placeholder until M3 wires it to /submit; the live layer arrives in M2.
(() => {
  const HOST_ID = "tz-host";
  if (document.getElementById(HOST_ID)) return; // idempotent

  const Z = "2147483647";
  const POS_KEY = "tz.widget.pos";
  const MARGIN = 16;

  // ---- host: top document, above everything ----
  const host = document.createElement("div");
  host.id = HOST_ID;
  const baseHostStyle = {
    position: "fixed",
    zIndex: Z,
    margin: "0",
    padding: "0",
    width: "auto",
    height: "auto",
    inset: "auto",
    pointerEvents: "auto",
    visibility: "visible",
    opacity: "1",
    display: "block",
    transform: "none",
    filter: "none",
    clip: "auto",
  };
  Object.assign(host.style, baseHostStyle);
  (document.documentElement || document.body).appendChild(host);

  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .tz {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; line-height: 1.4; color: #e8eaed;
      -webkit-font-smoothing: antialiased;
    }
    .launcher {
      display: inline-flex; align-items: center; gap: 6px;
      background: #1b1e24; color: #e8eaed; border: 1px solid #2c313a;
      border-radius: 999px; padding: 10px 16px; cursor: pointer;
      font: inherit; font-weight: 600; box-shadow: 0 6px 24px rgba(0,0,0,.35);
    }
    .launcher:hover { background: #232730; }
    .launcher .dot { color: #66ccff; }
    .panel {
      width: 300px; max-width: calc(100vw - ${MARGIN * 2}px);
      background: #15181d; border: 1px solid #2c313a; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,.45); overflow: hidden;
    }
    .panel[hidden] { display: none; }
    .bar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; background: #1b1e24; border-bottom: 1px solid #2c313a;
      cursor: grab; user-select: none; touch-action: none;
    }
    .bar.dragging { cursor: grabbing; }
    .bar .grip { color: #6b7280; letter-spacing: -2px; }
    .bar strong { flex: 1; font-size: 13px; }
    .bar .close { background: none; border: 0; color: #9aa0aa; font-size: 18px; cursor: pointer; line-height: 1; }
    .body { padding: 12px; }
    .hint { color: #9aa0aa; font-size: 12px; margin-bottom: 8px; }
    textarea {
      width: 100%; resize: none; background: #0f1115; color: #e8eaed;
      border: 1px solid #2c313a; border-radius: 10px; padding: 10px; font: inherit;
    }
    textarea:focus { outline: 2px solid #66ccff55; border-color: #66ccff; }
    .row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
    .count { color: #6b7280; font-size: 12px; font-variant-numeric: tabular-nums; }
    .submit {
      background: #66ccff; color: #06121c; border: 0; border-radius: 10px;
      padding: 8px 16px; font: inherit; font-weight: 700; cursor: pointer;
    }
    .submit:hover { background: #8ad6ff; }
    .submit:disabled { opacity: .5; cursor: default; }
    .status { min-height: 16px; margin-top: 8px; font-size: 12px; color: #66ccff; }
    .history { display: inline-block; margin-top: 6px; color: #9aa0aa; font-size: 12px; text-decoration: none; }
    .history:hover { color: #e8eaed; text-decoration: underline; }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "tz";
  wrap.innerHTML = `
    <button class="launcher" type="button" aria-label="Open tinker">
      <span class="dot" aria-hidden="true">&#10022;</span> tinker
    </button>
    <section class="panel" hidden aria-label="tinker.zone">
      <header class="bar">
        <span class="grip" aria-hidden="true">&#8942;&#8942;</span>
        <strong>tinker.zone</strong>
        <button class="close" type="button" aria-label="Close">&times;</button>
      </header>
      <div class="body">
        <p class="hint">Describe a change to this page.</p>
        <textarea class="prompt" rows="3" maxlength="500" placeholder="make the background sunset orange&#8230;"></textarea>
        <div class="row">
          <span class="count">0/500</span>
          <button class="submit" type="button">Send</button>
        </div>
        <p class="status" role="status"></p>
        <a class="history" href="/history">time machine &#8594;</a>
      </div>
    </section>
  `;
  root.appendChild(wrap);

  const $ = (sel) => root.querySelector(sel);
  const launcher = $(".launcher");
  const panel = $(".panel");
  const bar = $(".bar");
  const closeBtn = $(".close");
  const prompt = $(".prompt");
  const count = $(".count");
  const submit = $(".submit");
  const status = $(".status");

  // ---- open / close ----
  function open() { panel.hidden = false; launcher.style.display = "none"; prompt.focus(); }
  function close() { panel.hidden = true; launcher.style.display = ""; }
  launcher.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  // ---- char count ----
  const updateCount = () => { count.textContent = `${prompt.value.length}/500`; };
  prompt.addEventListener("input", updateCount);

  // ---- submit (M1 placeholder; M3 wires this to /submit) ----
  submit.addEventListener("click", () => {
    const text = prompt.value.trim();
    if (!text) { status.textContent = "Type something first."; return; }
    status.textContent = "Submissions open soon ✨";
  });

  // ---- drag (pointer events; persist position) ----
  let drag = null;
  function applyPos(x, y) {
    const w = host.offsetWidth || 320;
    const h = host.offsetHeight || 80;
    const maxX = Math.max(0, window.innerWidth - w - 2);
    const maxY = Math.max(0, window.innerHeight - h - 2);
    const cx = Math.min(Math.max(0, x), maxX);
    const cy = Math.min(Math.max(0, y), maxY);
    host.style.left = `${cx}px`;
    host.style.top = `${cy}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }
  function savePos() {
    const r = host.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch {}
  }
  bar.addEventListener("pointerdown", (e) => {
    const r = host.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.classList.add("dragging");
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    applyPos(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  bar.addEventListener("pointerup", (e) => {
    if (!drag) return;
    drag = null;
    bar.classList.remove("dragging");
    try { bar.releasePointerCapture(e.pointerId); } catch {}
    savePos();
  });

  // ---- default / restored position ----
  function placeDefault() {
    host.style.right = `${MARGIN}px`;
    host.style.bottom = `${MARGIN}px`;
    host.style.left = "auto";
    host.style.top = "auto";
  }
  (function restore() {
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(POS_KEY) || "null"); } catch {}
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) applyPos(pos.x, pos.y);
    else placeDefault();
  })();

  // ---- self-heal: keep visible, on-top, and within the viewport ----
  function selfHeal() {
    // Re-assert the host's own inline styles (defends against forced reflows/overrides).
    Object.assign(host.style, baseHostStyle);
    // If we drifted off-screen (e.g. viewport resize), snap back to a safe corner.
    const r = host.getBoundingClientRect();
    const off = r.right < 24 || r.bottom < 24 || r.left > window.innerWidth - 24 || r.top > window.innerHeight - 24;
    if (off || r.width === 0 || r.height === 0) placeDefault();
    // If something is painted over our anchor, re-append to the end of <html> to win stacking.
    const ax = Math.min(window.innerWidth - 8, Math.max(8, r.left + Math.min(r.width, 40) / 2));
    const ay = Math.min(window.innerHeight - 8, Math.max(8, r.top + Math.min(r.height, 24) / 2));
    const top = document.elementFromPoint(ax, ay);
    if (top && top !== host) {
      (document.documentElement || document.body).appendChild(host);
    }
  }
  updateCount();
  selfHeal();
  setInterval(selfHeal, 2000);
  window.addEventListener("resize", selfHeal);

  // Live layer: applies validated declarative patches to the canvas (M2). The widget is never
  // a patch target. M3 wires this to Supabase Realtime.
  initLiveLayer(window.TZ_CONFIG || {});
})();
