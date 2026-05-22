// Secondary build-time defense (the edge CSP is the PRIMARY anti-exfiltration boundary).
// Walks /canvas and rejects disallowed types, oversized files, and external/script content.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = path.join(ROOT, "canvas");

const ALLOWED_EXT = new Set([
  ".html", ".css", ".js", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2",
]);
const TEXT_EXT = new Set([".html", ".css", ".js", ".json", ".svg"]);
const MAX_TEXT = 100 * 1024; // 100 KB
const MAX_BIN = 500 * 1024; // 500 KB
const IGNORE = new Set([".gitkeep"]);

const FORBIDDEN = [
  { re: /<script[^>]+src\s*=\s*["']https?:\/\//i, msg: "external <script src>" },
  { re: /<(iframe|object|embed)\b/i, msg: "iframe/object/embed element" },
  { re: /\b(eval|Function)\s*\(/, msg: "eval / Function()" },
  { re: /\bimport\s*\(\s*["']https?:\/\//i, msg: "dynamic import() of a remote URL" },
  { re: /\b(fetch|XMLHttpRequest)\b[\s\S]{0,80}?https?:\/\//i, msg: "fetch/XHR to a remote URL" },
  { re: /\son\w+\s*=\s*["']/i, msg: "inline event handler (on*=)" },
  { re: /javascript:\s*\S/i, msg: "javascript: URL" },
];

const errors = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full);
      continue;
    }
    if (IGNORE.has(e.name)) continue;
    const rel = path.relative(CANVAS, full);
    const ext = path.extname(e.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      errors.push(`${rel}: disallowed file type "${ext || "(none)"}"`);
      continue;
    }
    const stat = await fs.stat(full);
    const cap = TEXT_EXT.has(ext) ? MAX_TEXT : MAX_BIN;
    if (stat.size > cap) {
      errors.push(`${rel}: ${Math.round(stat.size / 1024)}KB exceeds ${Math.round(cap / 1024)}KB cap`);
    }
    if (TEXT_EXT.has(ext)) {
      const text = await fs.readFile(full, "utf8");
      for (const { re, msg } of FORBIDDEN) {
        if (re.test(text)) errors.push(`${rel}: ${msg}`);
      }
    }
  }
}

const exists = await fs.access(CANVAS).then(() => true).catch(() => false);
if (!exists) {
  console.error("content-scanner: FAIL — canvas/ is missing");
  process.exit(1);
}
await walk(CANVAS);

if (errors.length) {
  console.error("content-scanner: FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("content-scanner: ok");
