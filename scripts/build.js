// Build pipeline: /canvas (canonical source) + /widget (injected runtime) -> /public.
//
// The widget is bundled in at build time, never read from the editable canvas. That is the
// architectural reason the automation physically cannot remove it.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { injectWidget } from "./inject-widget.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = path.join(ROOT, "canvas");
const WIDGET = path.join(ROOT, "widget");
const OUT = path.join(ROOT, "public");

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // 1. Canonical layer: copy /canvas -> /public
  await fs.cp(CANVAS, OUT, { recursive: true });

  // 1b. Static protected pages (time machine, privacy notice) — siblings of canvas at
  //     /public/history/ and /public/privacy/. Skipped if the directory doesn't exist yet.
  for (const sub of ["history", "privacy"]) {
    const src = path.join(ROOT, sub);
    try {
      await fs.access(src);
      await fs.cp(src, path.join(OUT, sub), { recursive: true });
    } catch {
      /* dir missing — skip */
    }
  }

  // 2. Widget runtime: bundle the widget entry (and its imports, including @supabase/supabase-js)
  //    into a single self-contained ESM module at /public/__tz/widget.js. Bundling is required
  //    because supabase-js comes from node_modules, not from a flat-relative path.
  await fs.mkdir(path.join(OUT, "__tz"), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(WIDGET, "widget.js")],
    bundle: true,
    format: "esm",
    outfile: path.join(OUT, "__tz", "widget.js"),
    target: "es2020",
    legalComments: "none",
    logLevel: "warning",
  });

  // 3. Emit runtime config (Supabase URL + anon key + Realtime topic) from
  //    shared/runtime-config.json as a classic script that runs BEFORE the widget module and
  //    sets window.TZ_CONFIG. The values are PUBLIC by design: the anon key is RLS-bound and
  //    intended for client use.
  const cfg = JSON.parse(await fs.readFile(path.join(ROOT, "shared", "runtime-config.json"), "utf8"));
  await fs.writeFile(
    path.join(OUT, "__tz", "config.js"),
    `window.TZ_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`,
  );

  // 4. Inject the config + widget bootstrap into index.html
  const indexPath = path.join(OUT, "index.html");
  try {
    await fs.access(indexPath);
  } catch {
    throw new Error("build: canvas/index.html is missing");
  }
  const html = await fs.readFile(indexPath, "utf8");
  await fs.writeFile(indexPath, injectWidget(html));

  console.log("build: ok -> public/");
}

main().catch((err) => {
  console.error(`build: FAIL — ${err.message || err}`);
  process.exit(1);
});
