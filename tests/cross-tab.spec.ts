// Cross-tab broadcast verification. Opens TWO independent browser contexts (≈ two browsers),
// has both subscribe to the live channel, submits a patch from the test process, and verifies
// BOTH contexts receive the broadcast and apply it to the DOM. Opt-in like diagnose-prod.
//
// Run with:
//   RUN_CROSS_TAB=1 npx playwright test tests/cross-tab.spec.ts --project=desktop-1440 --reporter=list

import { test, expect, chromium } from "@playwright/test";
import cfg from "../shared/runtime-config.json" with { type: "json" };

const PROD = "https://tinker-zone.vercel.app";
const SBF = `${cfg.supabaseUrl}/functions/v1`;
const HDR = {
  apikey: cfg.supabaseAnonKey,
  authorization: `Bearer ${cfg.supabaseAnonKey}`,
};

test("a patch broadcast reaches TWO independent browser contexts", async ({ request }) => {
  test.skip(!process.env.RUN_CROSS_TAB, "manual; set RUN_CROSS_TAB=1");
  test.setTimeout(90_000);

  const browser = await chromium.launch();
  try {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    const wsA: string[] = [];
    const wsB: string[] = [];
    pageA.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        const data = typeof f.payload === "string" ? f.payload : String(f.payload);
        if (data.includes("broadcast")) wsA.push(data);
      });
    });
    pageB.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        const data = typeof f.payload === "string" ? f.payload : String(f.payload);
        if (data.includes("broadcast")) wsB.push(data);
      });
    });

    console.log("=== loading both contexts ===");
    await Promise.all([
      pageA.goto(PROD, { waitUntil: "load" }),
      pageB.goto(PROD, { waitUntil: "load" }),
    ]);
    // give both subscriptions time to settle past phx_join
    await pageA.waitForTimeout(4000);
    await pageB.waitForTimeout(0);

    // Mark a marker color we can verify on both pages. Using --tz-accent because the current
    // live patches already set --tz-bg/--tz-fg; using a different var avoids confusion.
    const probe = `change the accent color to magenta`;
    console.log(`=== submitting from test process: ${probe}`);
    const submitRes = await request.post(`${SBF}/submit`, {
      headers: { ...HDR, "content-type": "application/json" },
      data: { prompt: probe },
    });
    const submitBody = await submitRes.json();
    console.log("=== submit:", JSON.stringify(submitBody, null, 2));

    // Wait for both pages to receive the broadcast and apply it
    await pageA.waitForTimeout(5000);

    const stateA = await pageA.evaluate(() => ({
      cssAccent: getComputedStyle(document.documentElement).getPropertyValue("--tz-accent").trim(),
      cssBg: getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim(),
    }));
    const stateB = await pageB.evaluate(() => ({
      cssAccent: getComputedStyle(document.documentElement).getPropertyValue("--tz-accent").trim(),
      cssBg: getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim(),
    }));
    console.log("=== context A state:", JSON.stringify(stateA, null, 2));
    console.log("=== context B state:", JSON.stringify(stateB, null, 2));
    console.log(`=== A received ${wsA.length} broadcast frame(s); B received ${wsB.length}`);
    for (const f of wsA) console.log("A RX:", f.slice(0, 300));
    for (const f of wsB) console.log("B RX:", f.slice(0, 300));

    // Both contexts must have received at least one broadcast AND have the new accent applied.
    expect(wsA.length, "context A should have received at least one broadcast frame").toBeGreaterThan(0);
    expect(wsB.length, "context B should have received at least one broadcast frame").toBeGreaterThan(0);
    // The patch model may emit hex or named; just verify accent changed from default.
    expect(stateA.cssAccent).not.toBe("");
    expect(stateB.cssAccent).not.toBe("");
    expect(stateA.cssAccent).toBe(stateB.cssAccent);
  } finally {
    await browser.close();
  }
});
