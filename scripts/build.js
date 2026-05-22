// Build pipeline: /canvas (canonical source) + /widget (injected runtime) -> /public.
//
// The widget is COPIED IN at build time, never read from the editable canvas. That is the
// architectural reason the automation physically cannot remove it.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

  // 2. Widget runtime: emit every /widget/*.js module to /public/__tz/ (flat layout, so the
  //    modules' relative "./" imports resolve identically in source and in the deployed bundle).
  await fs.mkdir(path.join(OUT, "__tz"), { recursive: true });
  for (const f of (await fs.readdir(WIDGET)).filter((n) => n.endsWith(".js"))) {
    await fs.copyFile(path.join(WIDGET, f), path.join(OUT, "__tz", f));
  }

  // 3. Inject the widget bootstrap into index.html
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
