// THE live-patch validator. Authoritative and dependency-free, so the SAME code runs in the
// browser (before applying a received patch), in the Supabase Edge function (before
// broadcasting), and in CI tests. Schema-level + semantic checks the JSON Schema can't express.
import * as V from "./patch-vocab.js";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i;
const LENGTH = /^\d{1,4}(px|rem|em|%)$/;
const NAMED_COLORS = new Set([
  "black", "white", "red", "green", "blue", "orange", "purple", "pink", "yellow", "cyan",
  "magenta", "gray", "grey", "navy", "teal", "gold", "coral", "crimson", "indigo", "salmon",
  "tan", "beige", "ivory", "maroon", "olive", "lime", "aqua", "fuchsia", "silver", "transparent",
]);

function isColor(v) {
  return typeof v === "string" && (HEX.test(v) || RGB.test(v) || NAMED_COLORS.has(v.toLowerCase()));
}

function safeSelector(s) {
  return typeof s === "string" && V.SAFE_SELECTOR.test(s) && !V.FORBIDDEN_SELECTORS.test(s);
}

function isAllowedImageSrc(src) {
  if (typeof src !== "string" || src.length > V.LIMITS.imageSrc) return false;
  // Root-relative, same-origin image (but not protocol-relative "//host").
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "https:" && V.IMAGE_HOSTS.includes(u.host);
  } catch {
    return false;
  }
}

function validateCssVar(name, value) {
  if (!V.CSS_VARS.includes(name)) return `unknown css var "${name}"`;
  if (typeof value !== "string" || value.length > V.LIMITS.cssValue) return "bad css value";
  if (name === "--tz-font") return V.FONTS.includes(value) ? null : "font not in allowlist";
  if (name === "--tz-radius" || name === "--tz-space") return LENGTH.test(value) ? null : "bad length value";
  return isColor(value) ? null : "bad color value";
}

function hasOnlyKeys(op, keys) {
  return Object.keys(op).every((k) => keys.includes(k));
}

function validateOp(op) {
  if (!op || typeof op !== "object") return "op is not an object";
  switch (op.op) {
    case "set_css_var":
      if (!hasOnlyKeys(op, ["op", "name", "value"])) return "set_css_var: unexpected keys";
      return validateCssVar(op.name, op.value);
    case "set_text":
      if (!hasOnlyKeys(op, ["op", "target", "value"])) return "set_text: unexpected keys";
      if (!safeSelector(op.target)) return "set_text: unsafe selector";
      if (typeof op.value !== "string" || op.value.length > V.LIMITS.text) return "set_text: bad value";
      return null;
    case "set_theme":
      if (!hasOnlyKeys(op, ["op", "theme"])) return "set_theme: unexpected keys";
      return Object.prototype.hasOwnProperty.call(V.THEMES, op.theme) ? null : "set_theme: unknown theme";
    case "add_element":
      if (!hasOnlyKeys(op, ["op", "kind", "container", "text", "class"])) return "add_element: unexpected keys";
      if (!V.PALETTE_KINDS.includes(op.kind)) return "add_element: kind not in palette";
      if (!safeSelector(op.container)) return "add_element: unsafe container";
      if (op.text != null && (typeof op.text !== "string" || op.text.length > V.LIMITS.text)) return "add_element: bad text";
      if (op.class != null && !V.PALETTE_CLASSES.includes(op.class)) return "add_element: class not in palette";
      return null;
    case "set_attr":
      if (!hasOnlyKeys(op, ["op", "target", "attr", "value"])) return "set_attr: unexpected keys";
      if (!safeSelector(op.target)) return "set_attr: unsafe selector";
      if (!V.ATTR_ALLOWLIST.includes(op.attr)) return "set_attr: attr not allowed";
      if (typeof op.value !== "string" || op.value.length > V.LIMITS.attr) return "set_attr: bad value";
      if (op.attr === "class" && !V.PALETTE_CLASSES.includes(op.value)) return "set_attr: class not in palette";
      return null;
    default:
      return `unknown op "${op && op.op}"`;
  }
}

export function validatePatch(patch) {
  const errors = [];
  if (!patch || typeof patch !== "object") return { ok: false, errors: ["patch is not an object"] };
  if (patch.v !== V.PATCH_VERSION) errors.push(`unsupported version (need ${V.PATCH_VERSION})`);
  if (!Array.isArray(patch.ops)) {
    errors.push("ops must be an array");
    return { ok: false, errors };
  }
  if (patch.ops.length < 1 || patch.ops.length > V.MAX_OPS) errors.push(`ops length must be 1..${V.MAX_OPS}`);
  patch.ops.forEach((op, i) => {
    const e = validateOp(op);
    if (e) errors.push(`ops[${i}]: ${e}`);
  });
  return { ok: errors.length === 0, errors };
}
