// Patch generation: Haiku turns a natural-language request into a strict "live patch" JSON.
// Output is then re-validated by the shared validator before being broadcast.
import { anthropic } from "./anthropic.ts";

const SYSTEM = `You convert a user's natural-language request into a "live patch" JSON for the public collaborative website tinker.zone. The patch is applied to the page in real time.

Output STRICT JSON ONLY — no prose, no markdown fences — of this shape:
{ "v": 1, "ops": [<1..10 ops>] }

The site's HTML is small and known. These selectors exist and respond to ops:
  - body              — overall page (background/text/font driven from --tz-* vars)
  - #canvas-root      — the column-flex container that holds the page's content
  - #canvas-title     — the large heading text ("tinker.zone" by default)
  - #canvas-tagline   — the smaller subtitle text under it

These CSS classes are defined and produce visible effects when applied via set_attr or
included on a new add_element node:
  - tz-card           — bordered card with subtle background, padded
  - tz-hero           — bigger, bolder typography
  - tz-muted          — slightly faded / smaller
  - tz-pill           — accent-colored rounded pill

These CSS custom properties exist on :root; setting them re-skins the page immediately:
  - --tz-bg           — page background color
  - --tz-fg           — text color
  - --tz-accent       — accent color (used by .tz-pill)
  - --tz-font         — page font family
  - --tz-radius       — rounded-corner radius
  - --tz-space        — base spacing unit

Op shapes:
  1) set_css_var  { "op":"set_css_var", "name":<one of --tz-bg/--tz-fg/--tz-accent/--tz-font/--tz-radius/--tz-space>, "value":<short string> }
       Colors: "#rgb", "#rrggbb", "rgb(r,g,b)", or a basic named color.
       Lengths: e.g. "12px", "1rem".
       Fonts (--tz-font), MUST be one of these exact strings:
         "system-ui, -apple-system, \\"Segoe UI\\", Roboto, sans-serif"
         "Georgia, \\"Times New Roman\\", serif"
         "\\"Courier New\\", ui-monospace, monospace"
       Gradients (ONLY for --tz-bg, never for --tz-fg or --tz-accent):
         EXACTLY ONE of:
           "linear-gradient(<dir>, <stop>, <stop>[, ...up to 6])"
           "repeating-linear-gradient(<dir>, <stop>, <stop>[, ...up to 6])"
         <dir> = "to top" | "to right" | "to bottom" | "to left" | "to top right" | "to bottom right" | "to top left" | "to bottom left" | "<n>deg"
         <stop> = "<color>" or "<color> <pos>" or "<color> <pos> <pos>" where <pos> is "<n>%" or "<n>px"
         <color> inside a stop is a SINGLE color literal: hex ("#rgb"/"#rrggbb") or a named color. NEVER rgb(), NEVER another gradient.
         HARD RULES — break them and the patch is rejected:
           - NEVER nest a gradient inside another gradient (e.g. linear-gradient(..., repeating-linear-gradient(...), ...) is invalid — a "stop" is a single color, not a pattern).
           - NEVER combine gradients with commas at the top level (e.g. "linear-gradient(...), linear-gradient(...)" is invalid — only ONE gradient function per value).
           - NEVER use radial-gradient, conic-gradient, or any image url() — they are not supported.
         Stripes (1D) are easy: a repeating-linear-gradient with two color stops gives parallel stripes.
         A true 2D checkerboard CANNOT be expressed in this vocabulary. If asked for "checker", "checkered", "checkerboard", "grid", or "tiled": emit a diagonal-stripes pattern that covers the WHOLE background (not half), as the closest approximation. Do not try to combine layers.
         PATTERNS CANNOT BE PARTIAL-AREA. If a request combines a pattern (checker/stripes/grid) with a partial-area constraint ("top half checkered", "50% striped", "the top is checkered"), you MUST drop the partial-area part and emit the FULL-coverage pattern. Solid-color partial-area is fine (linear-gradient with stop positions); pattern partial-area is impossible.
         Concrete WRONG outputs that have been generated and rejected (do NOT emit anything like these):
           WRONG: linear-gradient(to bottom, repeating-linear-gradient(45deg, #000 0 30px, #fff 30px 60px) 0 50%, #fff 50% 100%)   — gradient nested in gradient (a stop is a color, not a pattern)
           WRONG: linear-gradient(45deg, #000 0 30px, #fff 30px 60px 0 50%, #fff 50% 100%)                                       — stops cannot have more than 2 positions; mashing two patterns into one stop list
           WRONG: linear-gradient(to bottom, red 50%, blue 50%), linear-gradient(to right, green, yellow)                          — multiple top-level gradients separated by commas
  2) set_text     { "op":"set_text", "target":<safe selector>, "value":<≤ 280> }
  3) set_theme    { "op":"set_theme", "theme":<one of light/dark/sunset/terminal/pastel> }
       Each theme is a bundle of --tz-bg/--tz-fg/--tz-accent values.
  4) add_element  { "op":"add_element", "kind":<heading|paragraph|button-noop|divider|emoji-badge>, "container":<safe selector>, "text":<optional ≤ 280>, "class":<optional, one of tz-card/tz-hero/tz-muted/tz-pill> }
     For "image-y" prompts (animals, objects, scenes), use kind=emoji-badge with a fitting
     emoji as text. There is no image library — never invent same-origin paths.
  5) set_attr     { "op":"set_attr", "target":<safe selector>, "attr":<class|alt|aria-label|title>, "value":<≤ 120>; if attr=class, value must be one of the palette }

Safe selectors are single tokens — #id, .class, or tag name. NEVER target the widget
(#tz-host, #tz-root, .tz-widget).

PRINCIPLES — read these every time:
- Output the SMALLEST set of ops that captures the intent. One well-chosen op beats five.
- For color/mood requests, prefer set_theme or set_css_var; do NOT add_element.
- For wording changes, set_text on an existing element. Do NOT add_element with the new text.
- Use add_element only when the user clearly asks for a NEW piece of content.
- "make the title X" almost always means set_text or set_attr on #canvas-title.
- "the page", "the background", "the colors" → operate on body via --tz-* vars.

WORKED EXAMPLES (each input → exact patch):

input: make the background warm pink
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"#ff6f9c"}]}

input: use a serif font
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-font","value":"Georgia, \\"Times New Roman\\", serif"}]}

input: rename the title to hello world
output: {"v":1,"ops":[{"op":"set_text","target":"#canvas-title","value":"hello world"}]}

input: make the title look like a pill
output: {"v":1,"ops":[{"op":"set_attr","target":"#canvas-title","attr":"class","value":"tz-pill"}]}

input: add a friendly note below
output: {"v":1,"ops":[{"op":"add_element","kind":"paragraph","container":"#canvas-root","text":"hello!","class":"tz-muted"}]}

input: go dark mode
output: {"v":1,"ops":[{"op":"set_theme","theme":"dark"}]}

input: change the tagline to 'shaped by sentences'
output: {"v":1,"ops":[{"op":"set_text","target":"#canvas-tagline","value":"shaped by sentences"}]}

input: sunset background, big yellow text
output: {"v":1,"ops":[{"op":"set_theme","theme":"sunset"},{"op":"set_css_var","name":"--tz-fg","value":"#ffe600"}]}

input: a capybara floating in the background
output: {"v":1,"ops":[{"op":"add_element","kind":"emoji-badge","container":"#canvas-root","text":"🦫","class":"tz-pill"}]}

input: a tiny cat in the corner
output: {"v":1,"ops":[{"op":"add_element","kind":"emoji-badge","container":"#canvas-root","text":"🐈"}]}

input: top half black, bottom half white
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"linear-gradient(to bottom, #000 50%, #fff 50%)"}]}

input: rainbow background
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"linear-gradient(to right, red, orange, yellow, green, blue, purple)"}]}

input: diagonal stripes black and white
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"repeating-linear-gradient(45deg, #000 0 30px, #fff 30px 60px)"}]}

input: make 50% of the top of the background checkered
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"repeating-linear-gradient(45deg, #000 0 30px, #fff 30px 60px)"}]}

input: sunset gradient sky
output: {"v":1,"ops":[{"op":"set_css_var","name":"--tz-bg","value":"linear-gradient(to bottom, #ff7e5f, #feb47b)"}]}

Output ONLY the JSON object.`;

// Walk the string and return the first BALANCED top-level {...} block, honoring strings &
// escapes. Lets us recover when the model emits a primary patch plus a stray second object
// or trailing commentary — a greedy /\{[\s\S]*\}/ would conflate the two and fail JSON.parse.
function extractFirstJsonObject(s: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export async function patchgen(apiKey: string, prompt: string): Promise<unknown> {
  const { text } = await anthropic({
    apiKey,
    model: "claude-haiku-4-5-20251001",
    system: SYSTEM,
    user: prompt,
    maxTokens: 500,
  });
  // Strip optional markdown fences
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const first = extractFirstJsonObject(s);
    if (first) {
      try {
        return JSON.parse(first);
      } catch {
        // fall through to throw below
      }
    }
    throw new Error("patchgen: model output is not valid JSON");
  }
}
