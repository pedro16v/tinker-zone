// Injects the build-time widget bootstrap into the canonical HTML.
//
// The widget lives in /widget and is emitted to /public/__tz/ at build time, so it exists
// in NO file the canvas (Claude Code) can edit. The bootstrap is a same-origin module
// script, covered by `script-src 'self'` in the edge CSP — no inline-hash juggling needed.

export function injectWidget(html) {
  const tag = '<script type="module" src="/__tz/widget.js"></script>';
  if (html.includes('/__tz/widget.js')) return html; // idempotent
  if (html.includes('</body>')) {
    return html.replace('</body>', `    ${tag}\n  </body>`);
  }
  return `${html}\n${tag}\n`;
}
