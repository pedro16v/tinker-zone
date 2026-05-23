# Soft launch checklist

Run this list before sharing the site beyond a private channel.

## Stability

- [ ] `gh run list --workflow validate -L5` — last 5 PRs green.
- [ ] `gh run list --workflow deploy -L5` — last 5 deploys green.
- [ ] `https://tinker-zone.vercel.app` opens cleanly on:
  - [ ] Desktop Chrome
  - [ ] Desktop Safari/Firefox (less critical)
  - [ ] iOS Safari (real device)
  - [ ] Android Chrome (real device)
- [ ] The widget is reachable, draggable, accepts focus without keyboard bounce.
- [ ] One submission via the widget produces a visible live change within ~2–3 s.
- [ ] The bake-trigger cron has produced at least one batched bake end-to-end.
- [ ] `/history` lists the deployed bakes and each "open this version →" link works.
- [ ] `/privacy` is readable.

## Safety controls in place

- [ ] **Anthropic spend cap** set in `control.spend_cap_cents` (admin: `set_spend_cap`).
- [ ] **Kill switch** verified: `gh secret set` an admin caller, `action: kill` flips `submissions_open` off, widget shows "Submissions paused" within ~30 s.
- [ ] **Rate limit** known and acceptable for your traffic guess (currently 50 / hour / IP; tune in `submit/index.ts` if needed).
- [ ] **Turnstile** wired up in `/submit` (`TURNSTILE_SECRET_KEY` in Supabase function env) AND in the widget (`turnstileSiteKey` in `shared/runtime-config.json`). See ACCOUNT_SETUP.md.
- [ ] **CSP** is restrictive — `tests/csp.spec.ts` green.
- [ ] **Adversarial widget fixtures** — `tests/widget-fixtures.spec.ts` green.
- [ ] **Diff-scope CI gate** — manual try: open a PR touching `/widget/` or `/vercel.json`; `validate` must fail at diff-scope.

## Visible polish

- [ ] Canvas v0 is intentional and pleasant (not a chaotic test-leftover state).
- [ ] Patch-gen produces visually-binding ops for typical prompts ("yellow text", "dark mode", "rename title", "use a serif font").
- [ ] Time machine entries show real prompts (no `null` rows from pre-prompt-column inserts — if any, fail-batch them and reset canvas).
- [ ] Privacy notice mentions everything we collect, where it lives, what we never do.

## Outreach plan (when ready)

- [ ] **Domain** decision made (continue on `*.vercel.app` or buy `tinker.zone`).
- [ ] **3–5 trusted testers** identified and invited; collect feedback for one week.
- [ ] **First broader share** drafted (Hacker News, personal channels, etc.) with:
  - [ ] One-paragraph pitch.
  - [ ] Link to `/history` so people can see how it evolved.
  - [ ] Honest "this might break — moderation is a model and it learns over time" caveat.
- [ ] **Monitoring on launch day** — admin dashboard / `gh run watch` for spikes; be ready to flip the kill switch.

## After-launch

- [ ] Iterate `supabase/moderation-tests.md` based on real submissions.
- [ ] Tune `p_min_count` / `p_max_age_seconds` in the bake-trigger if bakes are too frequent or too rare.
- [ ] Watch Anthropic spend daily for the first week.
