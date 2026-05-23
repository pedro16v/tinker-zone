// Single source of truth for what a live patch may express. Imported by the validator
// (browser + Edge function + CI) and the applier (browser). Deliberately constrained: the
// live path bypasses CI, so a patch is declarative DATA, never code.

export const PATCH_VERSION = 1;
export const MAX_OPS = 10;
export const OPS = ["set_css_var", "set_text", "set_theme", "add_element", "set_attr"];

// CSS custom properties a patch may set on :root. The widget does NOT use these vars, so a
// patch can never restyle the widget through them.
export const CSS_VARS = ["--tz-bg", "--tz-fg", "--tz-accent", "--tz-font", "--tz-radius", "--tz-space"];

// Allowed --tz-font values (bundled / system stacks only — no remote fonts).
export const FONTS = [
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  'Georgia, "Times New Roman", serif',
  '"Courier New", ui-monospace, monospace',
];

// Named presets — each is only a bundle of set_css_var values, so nothing new is expressible.
export const THEMES = {
  light: { "--tz-bg": "#ffffff", "--tz-fg": "#11151c", "--tz-accent": "#0066cc" },
  dark: { "--tz-bg": "#0f1115", "--tz-fg": "#e8eaed", "--tz-accent": "#66ccff" },
  sunset: { "--tz-bg": "#2a1020", "--tz-fg": "#ffe6d5", "--tz-accent": "#ff8a5c" },
  terminal: { "--tz-bg": "#06120a", "--tz-fg": "#9dff9d", "--tz-accent": "#39ff14" },
  pastel: { "--tz-bg": "#fdf2f8", "--tz-fg": "#3a2e3f", "--tz-accent": "#d57fb0" },
};

// Note: `image` was removed in M5+ — without a curated image library, every add_element
// with kind=image was a broken image (404 on a same-origin path the bake never placed).
// "Image-y" prompts now map to emoji-badge in patch-gen.
export const PALETTE_KINDS = ["heading", "paragraph", "button-noop", "divider", "emoji-badge"];
export const PALETTE_CLASSES = ["tz-card", "tz-hero", "tz-muted", "tz-pill"];
export const ATTR_ALLOWLIST = ["class", "alt", "aria-label", "title"];

// Conservative image policy: empty host list = same-origin (root-relative) images only.
export const IMAGE_HOSTS = [];

// cssValue caps a flat color/length; cssValueBg is the larger cap for --tz-bg, which may
// also hold a parsed linear-gradient (validated stop-by-stop, never freeform CSS).
export const LIMITS = { text: 280, attr: 120, cssValue: 40, cssValueBg: 200, imageSrc: 300 };

// A safe selector is a single #id / .class / tag token; never the widget host.
export const SAFE_SELECTOR = /^[.#]?[A-Za-z][\w-]{0,63}$/;
export const FORBIDDEN_SELECTORS = /tz-host|tz-root|tz-widget/i;
