// One-off diagnostic test, runs against PRODUCTION. Captures everything we'd want to know
// about why a refresh might "lose" changes — Supabase requests, Realtime channel state,
// console errors, DB state via the anon REST API, and a real submit + reload cycle.
//
// Run alone via:
//   npx playwright test tests/diagnose-prod.spec.ts --project=desktop-1440 --reporter=list

import { test } from "@playwright/test";
import cfg from "../shared/runtime-config.json" with { type: "json" };

const PROD = "https://tinker-zone.vercel.app";
const SBR = `${cfg.supabaseUrl}/rest/v1`;
const SBF = `${cfg.supabaseUrl}/functions/v1`;
const HDR = {
  apikey: cfg.supabaseAnonKey,
  authorization: `Bearer ${cfg.supabaseAnonKey}`,
};

test("diagnose prod live-layer + catch-up", async ({ page, request }) => {
  // Opt-in — this hits PROD, submits a real patch, and bills Anthropic. Run manually with:
  //   RUN_PROD_DIAGNOSE=1 npx playwright test tests/diagnose-prod.spec.ts --project=desktop-1440 --reporter=list
  test.skip(!process.env.RUN_PROD_DIAGNOSE, "manual diagnostic; set RUN_PROD_DIAGNOSE=1");
  test.setTimeout(120_000);

  const errors: string[] = [];
  const supaReqs: string[] = [];
  const wsEvents: string[] = [];

  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} -> ${r.failure()?.errorText}`));
  page.on("request", (r) => {
    const url = r.url();
    if (url.includes("supabase.co")) supaReqs.push(`${r.method()} ${url.split("?")[0]}`);
  });
  page.on("response", (r) => {
    const url = r.url();
    if (url.includes("supabase.co")) supaReqs.push(`<- ${r.status()} ${url.split("?")[0]}`);
  });
  page.on("websocket", (ws) => {
    wsEvents.push(`OPEN ${ws.url()}`);
    ws.on("framereceived", (f) => {
      const data = typeof f.payload === "string" ? f.payload : String(f.payload);
      if (data.length < 400) wsEvents.push(`RX ${data}`);
    });
    ws.on("framesent", (f) => {
      const data = typeof f.payload === "string" ? f.payload : String(f.payload);
      if (data.length < 400) wsEvents.push(`TX ${data}`);
    });
    ws.on("close", () => wsEvents.push(`CLOSE ${ws.url()}`));
  });

  // ---- 1. initial DB state (what catch-up should be replaying) ----
  const liveBefore = await request.get(
    `${SBR}/live_patches?select=seq,status,prompt&order=seq.desc&limit=10`,
    { headers: HDR },
  );
  console.log("=== live_patches REST status:", liveBefore.status());
  console.log("=== live_patches (last 10):", JSON.stringify(await liveBefore.json(), null, 2));

  // ---- 2. load the page; wait for catch-up window to elapse ----
  console.log("=== navigating to prod ===");
  await page.goto(PROD, { waitUntil: "load" });
  await page.waitForTimeout(6000);

  const initial = await page.evaluate(() => {
    const w: { __tz?: { channel?: { state?: string } }; TZ_CONFIG?: unknown } =
      window as unknown as typeof w;
    return {
      hasTZConfig: !!w.TZ_CONFIG,
      hasTzApi: !!w.__tz,
      channelState: w.__tz?.channel?.state ?? "none",
      title: document.getElementById("canvas-title")?.textContent ?? null,
      tagline: document.getElementById("canvas-tagline")?.textContent ?? null,
      bodyBg: getComputedStyle(document.body).background.slice(0, 100),
      bodyColor: getComputedStyle(document.body).color,
      cssBgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim(),
      cssFgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-fg").trim(),
    };
  });
  console.log("=== INITIAL STATE on load:", JSON.stringify(initial, null, 2));

  // ---- 3. submit a natural prompt that should clearly bind: change --tz-fg ----
  const probe = process.env.PROBE_PROMPT || `make all the text on the page bright orange`;
  console.log(`=== submitting: ${probe}`);
  const submitRes = await request.post(`${SBF}/submit`, {
    headers: { ...HDR, "content-type": "application/json" },
    data: { prompt: probe },
  });
  console.log("=== submit status:", submitRes.status());
  console.log("=== submit body:", JSON.stringify(await submitRes.json(), null, 2));

  // Wait for the Realtime broadcast to arrive + be applied
  await page.waitForTimeout(5000);

  const afterSubmit = await page.evaluate(() => ({
    bodyColor: getComputedStyle(document.body).color,
    bodyBg: getComputedStyle(document.body).background.slice(0, 200),
    cssFgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-fg").trim(),
    cssBgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim(),
    tagline: document.getElementById("canvas-tagline")?.textContent ?? null,
  }));
  console.log("=== STATE after submit + 5s:", JSON.stringify(afterSubmit, null, 2));

  // ---- 4. reload and verify catch-up replays the patch we just submitted ----
  console.log("=== reloading ===");
  supaReqs.length = 0;
  errors.length = 0;
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(6000);

  const afterReload = await page.evaluate(() => ({
    bodyColor: getComputedStyle(document.body).color,
    bodyBg: getComputedStyle(document.body).background.slice(0, 200),
    cssFgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-fg").trim(),
    cssBgVar: getComputedStyle(document.documentElement).getPropertyValue("--tz-bg").trim(),
    tagline: document.getElementById("canvas-tagline")?.textContent ?? null,
  }));
  console.log("=== STATE after reload:", JSON.stringify(afterReload, null, 2));

  // ---- 5. dump everything ----
  console.log("=== SUPABASE NETWORK (on reload window):", JSON.stringify(supaReqs, null, 2));
  console.log("=== WS EVENTS:", JSON.stringify(wsEvents.slice(0, 30), null, 2));
  console.log("=== ERRORS:", JSON.stringify(errors, null, 2));

  // Final DB check
  const liveAfter = await request.get(
    `${SBR}/live_patches?select=seq,status,prompt&order=seq.desc&limit=5`,
    { headers: HDR },
  );
  console.log("=== live_patches (latest 5 after):", JSON.stringify(await liveAfter.json(), null, 2));
});
