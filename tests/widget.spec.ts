import { test, expect, type Page } from "@playwright/test";

// Anchor point near the top-left of the widget host, used to assert it is the topmost element.
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

test("widget is present, visible, and on top", async ({ page }) => {
  await page.goto("/");
  const host = page.locator("#tz-host");
  await expect(host).toHaveCount(1);

  const box = await host.boundingBox();
  expect(box, "widget has a layout box").not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  expect(await widgetIsOnTop(page)).toBe(true);

  // The shadow root is closed, so the page cannot reach into it.
  const closed = await page.evaluate(() => document.getElementById("tz-host")!.shadowRoot === null);
  expect(closed).toBe(true);
});

test("widget self-heals when covered by a hostile fullscreen overlay", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const o = document.createElement("div");
    o.id = "evil-overlay";
    Object.assign(o.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "red",
    });
    document.body.appendChild(o);
  });

  // The self-heal loop runs every 2s; give it one cycle to re-assert stacking.
  await page.waitForTimeout(2500);
  expect(await widgetIsOnTop(page)).toBe(true);
});
