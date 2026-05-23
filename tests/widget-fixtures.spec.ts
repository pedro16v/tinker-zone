import { test, expect, type Page } from "@playwright/test";

// Adversarial canvas fixtures — each one simulates a hostile state the canvas could create
// (overlays, extreme z-indices, scaled bodies, hidden bodies, giant fonts, corner-camping
// elements). The widget must remain present, visible, and on top for every one.

const FIXTURES = [
  "fullscreen-overlay",
  "extreme-zindex",
  "fixed-corner-cover",
  "transform-scale",
  "giant-font",
  "body-display-none",
];

async function widgetIsOnTop(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const h = document.getElementById("tz-host");
    if (!h) return false;
    const r = h.getBoundingClientRect();
    const x = r.left + Math.min(r.width, 40) / 2;
    const y = r.top + Math.min(r.height, 24) / 2;
    return document.elementFromPoint(x, y) === h;
  });
}

for (const fixture of FIXTURES) {
  test(`widget survives ${fixture}`, async ({ page }) => {
    await page.goto(`/fixtures/${fixture}.html`);
    // One self-heal cycle so the widget settles if anything tried to bury it.
    await page.waitForTimeout(2200);

    const host = page.locator("#tz-host");
    await expect(host).toHaveCount(1);

    const box = await host.boundingBox();
    expect(box, "widget has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    expect(await widgetIsOnTop(page), `widget should be topmost in ${fixture}`).toBe(true);

    // The shadow root must remain closed (no leakage from the hostile page).
    const closed = await page.evaluate(
      () => document.getElementById("tz-host")!.shadowRoot === null,
    );
    expect(closed).toBe(true);
  });
}
