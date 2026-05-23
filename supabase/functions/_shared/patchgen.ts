// Patch generation: Haiku turns a natural-language request into a strict "live patch" JSON.
// Output is then re-validated by the shared validator before being broadcast.
import { anthropic } from "./anthropic.ts";

const SYSTEM = `You convert a user's natural-language request into a "live patch" JSON for the website tinker.zone. The patch is applied to the page in real time.

Output STRICT JSON ONLY (no prose, no markdown fences) matching:

{
  "v": 1,
  "ops": [<1 to 10 ops>]
}

Op shapes:

1) set_css_var
   { "op":"set_css_var", "name":<one of "--tz-bg","--tz-fg","--tz-accent","--tz-font","--tz-radius","--tz-space">, "value":<short string> }
   - bg/fg/accent: a CSS color (hex #RGB / #RRGGBB, rgb(r,g,b), or a basic named color).
   - font: one of the three bundled stacks:
       'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
       'Georgia, "Times New Roman", serif'
       '"Courier New", ui-monospace, monospace'
   - radius / space: a length like "12px", "1rem".

2) set_text
   { "op":"set_text", "target":<safe selector>, "value":<string, ≤ 280 chars> }

3) set_theme
   { "op":"set_theme", "theme":<one of "light","dark","sunset","terminal","pastel"> }

4) add_element
   { "op":"add_element", "kind":<one of "heading","paragraph","button-noop","divider","image","emoji-badge">, "container":<safe selector>, "text":<optional string ≤ 280>, "class":<optional, one of "tz-card","tz-hero","tz-muted","tz-pill">, "src":<required for kind=image; must be a same-origin path starting with "/"> }

5) set_attr
   { "op":"set_attr", "target":<safe selector>, "attr":<one of "class","alt","aria-label","title">, "value":<≤ 120>; if attr=class, value must be one of the palette above }

Safe selectors are single tokens — #id, .class, or a tag name — and must NEVER target the widget (#tz-host, #tz-root, .tz-widget).

Useful selectors on the current canvas: "#canvas-root", "#canvas-title", "#canvas-tagline", "body".

Pick the smallest, clearest set of ops that captures the visual intent. Prefer set_theme or set_css_var for color/mood requests; set_text for wording; add_element only when the user asks for a new element.`;

export async function patchgen(apiKey: string, prompt: string): Promise<unknown> {
  const { text } = await anthropic({
    apiKey,
    model: "claude-haiku-4-5-20251001",
    system: SYSTEM,
    user: prompt,
    maxTokens: 500,
  });
  // Strip optional markdown fences just in case
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("patchgen: model output is not valid JSON");
  }
}
