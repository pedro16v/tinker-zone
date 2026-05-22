// HARD GATE: fail if a PR changes anything outside /canvas/.
//
// This — not CLAUDE.md — is the real enforcement that the automation only edits the canvas.
// Because nothing outside /canvas/ may change, this also subsumes a "frozen dependencies"
// check: any edit to package.json / lockfile (repo root) fails here.
import { execSync } from "node:child_process";

const ALLOW = [/^canvas\//];

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function changedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : process.env.DIFF_BASE || "origin/main";
  const out = sh(`git diff --name-only ${baseRef}...HEAD`);
  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}

const files = changedFiles();
const offending = files.filter((f) => !ALLOW.some((re) => re.test(f)));

if (offending.length) {
  console.error("diff-scope: FAIL — PR touches protected paths (only canvas/ is editable):");
  for (const f of offending) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`diff-scope: ok — ${files.length} changed file(s), all under canvas/`);
