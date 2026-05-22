import { test, expect } from "@playwright/test";

test("live layer applies a valid patch to the canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__tz);

  const res = await page.evaluate(() =>
    (window as any).__tz.apply({ v: 1, ops: [{ op: "set_theme", theme: "sunset" }] })
  );
  expect(res.ok).toBe(true);
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim()
  );
  expect(bg).toBe("#2a1020");

  await page.evaluate(() =>
    (window as any).__tz.apply({ v: 1, ops: [{ op: "set_text", target: "#canvas-title", value: "patched!" }] })
  );
  await expect(page.locator("#canvas-title")).toHaveText("patched!");
});

test("live layer rejects an invalid patch and never touches the widget", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__tz);

  const res = await page.evaluate(() =>
    (window as any).__tz.apply({ v: 1, ops: [{ op: "set_text", target: "#tz-host", value: "hijacked" }] })
  );
  expect(res.ok).toBe(false);

  const intact = await page.evaluate(() => {
    const h = document.getElementById("tz-host");
    return !!h && h.shadowRoot === null;
  });
  expect(intact).toBe(true);
});
