import { test, expect } from "@playwright/test";

// Production-equivalent CSP behavior is enforced locally by scripts/serve.js (which mirrors
// vercel.json's headers). These tests catch CSP regressions before they ship.

test("CSP header is set and restrictive", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);

  const csp = res.headers()["content-security-policy"];
  expect(csp, "Content-Security-Policy header present").toBeTruthy();

  // The widget is loaded as a same-origin module — script-src is locked to 'self'.
  expect(csp).toMatch(/script-src[^;]*'self'/);
  // No inline scripts allowed.
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  // No wildcards in script-src.
  expect(csp).not.toMatch(/script-src[^;]*\*/);
  // object-src locked off — no plugins.
  expect(csp).toMatch(/object-src 'none'/);
  // connect-src lists 'self' (and the specific Supabase + Turnstile hosts).
  expect(csp).toMatch(/connect-src[^;]*'self'/);
  expect(csp).toMatch(/connect-src[^;]*supabase\.co/);
  expect(csp).not.toMatch(/connect-src[^;]*\*/);
});

test("CSP blocks exfiltration to a non-allowlisted host", async ({ page }) => {
  // Capture any network request to evil.tld; CSP should prevent any from being made.
  const exfilRequests: string[] = [];
  page.on("request", (req) => {
    if (/evil\.tld/.test(req.url())) exfilRequests.push(req.url());
  });

  await page.goto("/fixtures/csp-exfil.html");

  // Wait for the inline same-origin script to run + the fetch attempt to settle.
  await page.waitForFunction(() => (window as { __tzExfilResult?: unknown }).__tzExfilResult !== undefined, {
    timeout: 5000,
  });
  const result = await page.evaluate(() => (window as { __tzExfilResult?: { ok: boolean; error?: string; status?: number } }).__tzExfilResult);

  expect(result, "exfil result captured").toBeTruthy();
  // The fetch must have been rejected by CSP (TypeError "Failed to fetch" or similar).
  expect(result!.ok, "fetch to evil.tld should be blocked").toBe(false);

  // And — defense in depth — no actual network request should have left the browser.
  expect(exfilRequests, "no network request reached evil.tld").toHaveLength(0);
});
