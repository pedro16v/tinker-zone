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
