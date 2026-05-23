import { test, expect } from "@playwright/test";
// The validator is pure JS (no DOM), so this runs as a plain Node test — no browser needed.
import { validatePatch } from "../widget/patch-validator.js";

const VALID = [
  { v: 1, ops: [{ op: "set_theme", theme: "dark" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "#ff8800" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-accent", value: "rgb(255, 0, 0)" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-radius", value: "20px" }] },
  { v: 1, ops: [{ op: "set_text", target: "#canvas-title", value: "hello world" }] },
  { v: 1, ops: [{ op: "add_element", kind: "paragraph", container: "#canvas-root", text: "hi", class: "tz-muted" }] },
  { v: 1, ops: [{ op: "add_element", kind: "emoji-badge", container: "#canvas-root", text: "🦫" }] },
  { v: 1, ops: [{ op: "set_attr", target: ".thing", attr: "aria-label", value: "x" }] },
  // Gradients (--tz-bg only). Each stop parses individually; we never accept freeform CSS.
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to bottom, #000 50%, #fff 50%)" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to right, red, orange, yellow, green, blue, purple)" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "repeating-linear-gradient(45deg, #000 0 30px, #fff 30px 60px)" }] },
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(90deg, #ff7e5f, #feb47b)" }] },
];

const INVALID = [
  { v: 2, ops: [{ op: "set_theme", theme: "dark" }] }, // bad version
  { v: 1, ops: [] }, // empty
  { v: 1, ops: [{ op: "exec", cmd: "rm -rf /" }] }, // unknown op
  { v: 1, ops: [{ op: "set_css_var", name: "--evil", value: "x" }] }, // unknown var
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "url(http://evil)" }] }, // not a color
  { v: 1, ops: [{ op: "set_text", target: "#tz-host", value: "x" }] }, // widget host
  { v: 1, ops: [{ op: "set_text", target: "div > script", value: "x" }] }, // unsafe selector
  { v: 1, ops: [{ op: "add_element", kind: "iframe", container: "#x" }] }, // bad kind
  { v: 1, ops: [{ op: "add_element", kind: "image", container: "#x" }] }, // image removed from vocab
  { v: 1, ops: [{ op: "set_attr", target: ".x", attr: "onclick", value: "alert(1)" }] }, // bad attr
  { v: 1, ops: [{ op: "set_attr", target: ".x", attr: "class", value: "evil" }] }, // class not in palette
  { v: 1, ops: [{ op: "set_text", target: "#a", value: "x", extra: 1 }] }, // unexpected key
  { v: 1, ops: new Array(11).fill({ op: "set_theme", theme: "dark" }) }, // too many ops
  // Gradient negatives — anything outside the parser's tight grammar must be rejected.
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "radial-gradient(circle, red, blue)" }] }, // wrong gradient kind
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to bottom, javascript:alert(1), red)" }] }, // js url smuggled
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to bottom, red)" }] }, // only one stop
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to nowhere, red, blue)" }] }, // bad direction
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to bottom, red, blue), url(x)" }] }, // multi-value smuggle
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-fg", value: "linear-gradient(to bottom, red, blue)" }] }, // gradient only allowed on --tz-bg
  { v: 1, ops: [{ op: "set_css_var", name: "--tz-bg", value: "linear-gradient(to bottom, red 50%, white 50%, red 50%, white 50%, red 50%, white 50%, red 50%)" }] }, // too many stops
];

test("validator accepts well-formed patches", () => {
  for (const p of VALID) {
    const r = validatePatch(p);
    expect(r.ok, `${JSON.stringify(p)} => ${r.errors.join("; ")}`).toBe(true);
  }
});

test("validator rejects malformed / unsafe patches", () => {
  for (const p of INVALID) {
    expect(validatePatch(p).ok, `should reject ${JSON.stringify(p)}`).toBe(false);
  }
});
