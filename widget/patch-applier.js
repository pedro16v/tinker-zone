// Applies a VALIDATED live patch to the canvas DOM. Pure declarative effects only.
//
// Safety: every selector is resolved with `document.body.querySelector`. The widget host
// lives in <html> OUTSIDE <body>, so a patch can never select or mutate it — on top of the
// validator's explicit widget-host ban. set_css_var/set_theme touch only :root custom
// properties, which the widget does not use.
import * as V from "./patch-vocab.js";
import { validatePatch } from "./patch-validator.js";

const LIVE_ATTR = "data-tz-live";

function resolve(selector) {
  try {
    return document.body.querySelector(selector);
  } catch {
    return null;
  }
}

function buildNode(op) {
  let el;
  switch (op.kind) {
    case "heading":
      el = document.createElement("h2");
      el.textContent = op.text || "";
      break;
    case "paragraph":
      el = document.createElement("p");
      el.textContent = op.text || "";
      break;
    case "button-noop":
      el = document.createElement("button");
      el.type = "button";
      el.textContent = op.text || "button";
      break;
    case "divider":
      el = document.createElement("hr");
      break;
    case "emoji-badge":
      el = document.createElement("span");
      el.textContent = op.text || "✨";
      break;
    default:
      return null;
  }
  if (op.class) el.classList.add(op.class);
  return el;
}

function applyOp(op) {
  switch (op.op) {
    case "set_css_var":
      document.documentElement.style.setProperty(op.name, op.value);
      break;
    case "set_theme":
      for (const [k, val] of Object.entries(V.THEMES[op.theme])) {
        document.documentElement.style.setProperty(k, val);
      }
      break;
    case "set_text": {
      const el = resolve(op.target);
      if (el) el.textContent = op.value; // textContent escapes — no markup injection
      break;
    }
    case "set_attr": {
      const el = resolve(op.target);
      if (el) el.setAttribute(op.attr, op.value);
      break;
    }
    case "add_element": {
      const container = resolve(op.container) || document.body;
      const node = buildNode(op);
      if (node) {
        node.setAttribute(LIVE_ATTR, "1");
        container.appendChild(node);
      }
      break;
    }
  }
}

// Re-validates before applying — never trust the wire.
export function applyPatch(patch) {
  const { ok, errors } = validatePatch(patch);
  if (!ok) return { ok: false, errors };
  for (const op of patch.ops) applyOp(op);
  return { ok: true };
}

// Best-effort same-session teardown of added nodes. The authoritative reset is the canonical
// page reload triggered when a bake deploys (M4), which wipes all ephemeral mutations.
export function resetLive() {
  document.body.querySelectorAll(`[${LIVE_ATTR}]`).forEach((n) => n.remove());
}
