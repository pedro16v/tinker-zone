# tinker.zone — Project Plan

A collaborative website that anyone can reshape via natural-language prompts. Each submission becomes a GitHub issue, picked up by Claude Code, implemented, validated, merged, and deployed automatically. Users see the site's evolution through a time machine view.

## How to use this document

This is the source-of-truth plan, broken into **9 epics**. Each epic is sized to become a single GitHub issue with the `epic` label. Sub-tasks (the `- [ ]` items inside each epic) become individual issues or PR checklists as work begins.

- **Phase 1 (MVP)** — Epics 1–5 + 7. The minimum needed to run the full loop end-to-end.
- **Phase 2 (Polish & Safety)** — Epics 6, 8, 9. Time machine, kill switch, privacy, soft launch.
- **Phase 3 (Future)** — Voting, themes, featured snapshots, "surprise me", fork. Captured in epic backlog, not detailed here.

Budget ceiling: **$10/month**. Architectural decisions in this plan are shaped by that constraint.

---

## Epic 1: Project Foundation

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-infra`
**Depends on:** —

### Goal
Set up the repo skeleton, deployment targets, and the architectural rules document (`CLAUDE.md`) that every future change must respect. This epic establishes the immutable scaffolding everything else depends on.

### Acceptance Criteria
- Repo directory structure clearly separates editable surface (`/canvas/`) from protected zones (`/widget/`, `/history/`, `/scripts/`, `/.github/`, `/supabase/`).
- Vercel project connected to repo with auto-deploy on `main` and preview deploys on PRs.
- Supabase project provisioned; connection strings stored in GitHub Actions secrets.
- `CLAUDE.md` exists and is exhaustive on what Claude Code may and may not touch.
- `README.md` pitches the project and lists required secrets.

### Stories
- [ ] Create directory skeleton: `/canvas/`, `/widget/`, `/history/`, `/scripts/`, `/.github/`, `/supabase/`
- [ ] Add `.gitignore`, `LICENSE` (MIT or similar), basic `README.md`
- [ ] Provision Vercel project, connect to repo, enable PR preview deploys
- [ ] Provision Supabase project; record connection strings as GitHub Actions secrets
- [ ] Write `CLAUDE.md`: protected files list, editable surface, capability restrictions, CI gate description
- [ ] Document all required secrets in `README.md` (Anthropic API key, Resend API key, Supabase keys, GitHub PAT, Turnstile keys, admin token)
- [ ] Create issue and PR templates under `.github/`
- [ ] Create GitHub labels: `epic`, `phase-1`, `phase-2`, `phase-3`, `area-frontend`, `area-backend`, `area-ci`, `area-safety`, `area-infra`, `claude-task`, `blocked`, `needs-discussion`

### Notes
`CLAUDE.md` is the most important artefact of this epic. It is the contract that defines Claude Code's behaviour. Treat it as a living document — every time we learn something new about what Claude Code should not do, it gets added.

---

## Epic 2: The Site (Canvas + Widget + Build Pipeline)

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-frontend`
**Depends on:** Epic 1

### Goal
Deliver the user-facing site: a blank canvas as v0, an always-visible draggable widget injected via the build process, and the architectural separation that makes the widget tamper-proof regardless of what Claude Code does to the canvas.

### Acceptance Criteria
- Blank canvas loads at root URL with only a title.
- Widget appears (default: bottom-right), is draggable, and remains functional across all subsequent canvas changes.
- Build pipeline injects the widget into the canvas at deploy time — the widget is **not** stored inside any file Claude Code can edit.
- Widget renders inside a Shadow DOM (or equivalent isolation) so canvas CSS cannot bleed in.
- Widget self-heals: on runtime detection of being hidden, covered, or off-screen, it forces itself visible and pings a logging endpoint.
- Responsive at 375px, 768px, 1440px viewports.

### Stories
- [ ] Implement `/canvas/canvas.html` as the v0 state (title only, no styling beyond a reset)
- [ ] Decide and document the title text for v0 (e.g. "tinker.zone" or a date stamp)
- [ ] Implement `/widget/` as a self-contained component (HTML + CSS + JS, no framework)
- [ ] Implement `/scripts/build.js` that reads `/canvas/` and injects the widget at build time
- [ ] Implement widget Shadow DOM container with `z-index` from a CSS variable set outside the editable scope
- [ ] Implement draggable behaviour (mouse + touch); persist position in `localStorage`
- [ ] Implement submission textarea + submit button (with character limit, e.g. 500 chars)
- [ ] Implement optional email field with discreet dismiss option (default state: field present but optional, "no spam, never shared" microcopy, X to dismiss)
- [ ] Implement status display ("queued" → "building" → "live") polling submission status from Supabase
- [ ] Implement runtime self-check loop: every 2s, check `getBoundingClientRect`, `elementFromPoint` at widget centre; if obscured, force visibility and log
- [ ] Implement time machine link inside widget
- [ ] Mobile responsive testing
- [ ] Document the widget's runtime API and contract in `/widget/README.md`

### Notes
The "widget is built in, not stored in canvas files" pattern is the single most important architectural decision in this project. It is what makes pure automation defensible — Claude Code physically cannot remove the widget because the widget does not exist in any file Claude Code can edit.

---

## Epic 3: Submission Pipeline (Database, Moderation, Rate Limiting)

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-backend`, `area-safety`
**Depends on:** Epic 1

### Goal
Accept submissions, moderate them with an LLM, rate-limit abuse, and queue approved ones for implementation. This is the first line of defence against malicious or low-quality prompts.

### Acceptance Criteria
- Submissions stored in Supabase with full status lifecycle (`pending` → `approved`/`rejected` → `queued` → `building` → `live`/`failed`).
- Cloudflare Turnstile blocks obvious bot traffic before the request hits the moderation function.
- Every submission moderated by Claude Haiku with a strict, documented system prompt.
- Rate limits enforced per IP hash and per email domain (hourly + daily windows).
- Queue selection logic picks 1–2 approved submissions per day for implementation.
- All cost-sensitive operations checked against monthly spend cap.

### Stories
- [ ] Design and create Supabase tables: `submissions`, `rate_limits`, `email_queue`, `kill_switch`, `spend_tracker`
- [ ] Write SQL migrations under `/supabase/migrations/`
- [ ] Create Supabase Edge Function: `POST /submit` (accepts prompt + optional email + Turnstile token)
- [ ] Integrate Cloudflare Turnstile (server-side token verification)
- [ ] Build moderation function: calls Claude Haiku with system prompt covering profanity, harassment, mentions of real people, widget tampering, prompt injection attempts, requests for external scripts or trackers, illegal content
- [ ] Build rate limiter (IP hash + email domain checks against time windows; configurable thresholds in env)
- [ ] Build queue selection cron (runs daily at fixed time; picks N approved submissions; marks `queued`)
- [ ] Implement spend tracker: every Anthropic API call logged with token count and estimated cost
- [ ] Implement spend cap enforcement: queue worker checks remaining budget before processing
- [ ] Public submission feed endpoint (read-only list of recent submissions + status, for transparency)
- [ ] Write the moderation system prompt iteratively; maintain `/supabase/moderation-tests.md` with adversarial examples and expected verdicts
- [ ] Document the moderation policy plainly (what gets rejected, what doesn't, how to appeal)

### Notes
The moderation prompt is the second most important artefact in this project (after `CLAUDE.md`). Budget real time to write it well and to maintain a regression test set of adversarial prompts.

---

## Epic 4: Claude Code Workflow (Issue → PR → Merge → Deploy)

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-backend`, `area-ci`
**Depends on:** Epic 1, Epic 3

### Goal
Wire up the automation: when a submission is queued, a GitHub issue is created; Claude Code Action picks it up, edits the canvas, opens a PR; CI runs; PR auto-merges if green; Vercel deploys; the submission record is updated.

### Acceptance Criteria
- Approved + queued submissions auto-create GitHub issues with the `claude-task` label and a link back to the submission ID.
- Claude Code Action picks up `claude-task` labelled issues automatically.
- Claude Code can only edit files within `/canvas/`; all other paths are read-only or invisible to it.
- PR is opened by the action with a clear title, the original prompt, and a link to the preview URL.
- CI must pass before merge is allowed.
- Auto-merge enabled for passing PRs.
- Vercel deploy hook updates submission status to `live` and stores the immutable deploy URL.

### Stories
- [ ] Supabase webhook → GitHub API to create issue from queued submission
- [ ] Configure Claude Code GitHub Action (`.github/workflows/claude.yml`)
- [ ] Lock down Claude Code in `CLAUDE.md`: editable paths, no shell commands beyond build/test, no new npm dependencies without manual approval
- [ ] Write the PR template (auto-populated with submission ID, prompt, preview URL)
- [ ] Configure GitHub branch protection: required status checks, auto-merge enabled when checks pass
- [ ] Vercel deploy webhook → Supabase function to mark submission `live` and capture the deploy URL
- [ ] Failure handling: CI failure → mark submission as `failed`, log reason, notify user (Epic 7)
- [ ] Implement retry policy: max 1 retry per submission, then permanently abandon
- [ ] Document Claude Code's capabilities and restrictions inside `CLAUDE.md` itself (so the action reads them)

### Notes
This is the epic where pure automation actually happens. Worth doing extra paranoid testing here before pointing it at real public traffic.

---

## Epic 5: Widget Validation & Content Safety CI

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-ci`, `area-safety`
**Depends on:** Epic 2, Epic 4

### Goal
Every PR is gated by automated checks that guarantee the widget remains functional and no malicious content has been introduced. This is the CI gate that makes pure automation survivable.

### Acceptance Criteria
- Playwright test suite runs on every PR opened against `main`.
- Widget presence, visibility, and interactivity verified at 3 viewport sizes.
- Adversarial CSS scenarios (fullscreen overlays, extreme z-index, fixed elements covering corners) tested as fixtures.
- Content scanner blocks external scripts, suspicious fetch URLs, and unapproved domains.
- Build must succeed for PR to merge.
- All CI scripts live under `/scripts/` or `/.github/` and are excluded from Claude Code's editable surface.

### Stories
- [ ] Set up Playwright in CI under `/.github/workflows/validate.yml`
- [ ] Test: widget DOM element exists after page load
- [ ] Test: widget is visible (`getBoundingClientRect` within viewport, not `display:none`/`opacity:0`/`visibility:hidden`)
- [ ] Test: widget is on top (`elementFromPoint` at widget centre returns widget root)
- [ ] Test: submit button is clickable, textarea accepts text input
- [ ] Test: widget is draggable (simulate pointer drag, assert position changes)
- [ ] Test: widget survives `window.scrollTo` to bottom of page
- [ ] Test matrix: run all the above at 375px, 768px, 1440px viewport widths
- [ ] Fixtures: pre-built adversarial canvas pages that try to break the widget (fullscreen overlays, huge fonts, fixed elements over corners, transform: scale, etc.)
- [ ] Content scanner: reject `<script src="...">` to non-allowlisted domains
- [ ] Content scanner: reject `fetch(`, `XMLHttpRequest`, `import(` to non-allowlisted endpoints
- [ ] Content scanner: file size limits per file (e.g. 100 KB per HTML/CSS/JS file)
- [ ] Content scanner: HTML must be parseable (no malformed markup that could trap the browser)
- [ ] Build verification step (run the build script, ensure no errors)
- [ ] Document the full CI gate inside `CLAUDE.md` so Claude Code knows the rules in advance

### Notes
The adversarial fixtures are key — anyone testing this who's clever will find new ways to break the widget. Treat the fixtures as a living regression suite.

---

## Epic 6: Time Machine

**Phase:** 2
**Labels:** `epic`, `phase-2`, `area-frontend`
**Depends on:** Epic 2, Epic 4

### Goal
Users can browse the site's evolution, see past versions live in their browser, and link to specific moments in time.

### Acceptance Criteria
- `/history/` route displays a chronological list of all deployed versions.
- Each entry shows: timestamp, originating prompt, link to the live deploy URL (Vercel's immutable per-deploy URL).
- Permalink format: `/history/{deploy_id}`.
- Scrubber UI enables fast navigation through versions.

### Stories
- [ ] Implement `/history/` route as a protected page (not in Claude Code's editable scope)
- [ ] Query Supabase for all `live` submissions ordered by deploy time (newest first by default)
- [ ] Embed historical versions in iframes pointing to Vercel deploy URLs
- [ ] Build scrubber component (timeline slider; keyboard arrow-key navigation)
- [ ] Implement permalink routing
- [ ] "Open in new tab" link for each version
- [ ] (Optional) Capture screenshot in CI for thumbnail grid view
- [ ] (Optional) Side-by-side diff view of canvas HTML between versions

### Notes
Vercel's immutable per-deploy URLs make the time machine essentially free — no need to store snapshots ourselves. Just record `{deploy_url, timestamp, prompt}` in the DB.

---

## Epic 7: Notifications & Email

**Phase:** 1
**Labels:** `epic`, `phase-1`, `area-backend`
**Depends on:** Epic 3, Epic 4

### Goal
Users who left an email get notified when their change ships. Pedro gets a daily digest of activity.

### Acceptance Criteria
- Resend integration sends emails on successful deploy.
- Email template is clean, lightly branded, includes the prompt + link to the deploy + time machine link.
- Emails sent only after deploy is verified live (not just merged).
- Daily digest to Pedro summarises submissions, builds, rejections, and anomalies.
- Email addresses deleted from DB after notification sent (or after 30 days max, whichever comes first).

### Stories
- [ ] Resend account setup + domain verification (or use Resend's onboarding domain initially)
- [ ] Email template: "Your change is live!" with prompt + deploy URL + time machine link + plain-text fallback
- [ ] Trigger function: on deploy success, send email if address exists
- [ ] On successful send, mark email as sent and delete the address field
- [ ] Daily digest cron job: summarise last 24h activity (submissions accepted, rejected, built, failed, spend), email Pedro
- [ ] Email deletion nightly job: purge any email older than 30 days regardless of status
- [ ] Handle Resend bounce webhook: log, do not retry, do not block future submissions

### Notes
Phase 1 includes user notifications. The daily digest to Pedro can slip to Phase 2 if needed but is genuinely useful early.

---

## Epic 8: Safety Net & Admin Controls

**Phase:** 2
**Labels:** `epic`, `phase-2`, `area-safety`
**Depends on:** Epic 3, Epic 4

### Goal
Pedro can intervene fast when things go sideways, without needing a laptop. Spend is hard-capped. Rollback is one click.

### Acceptance Criteria
- Kill switch endpoint toggles `submissions_open` flag in DB; widget reflects state within 10 seconds.
- Admin alerts via ntfy.sh (or Pushover) on critical events.
- One-click revert deployable from a mobile-friendly admin page.
- Anthropic spend hard-capped at $10/month; queue freezes when 90% of cap reached.
- All admin endpoints require an admin token (stored in env, sent via header).

### Stories
- [ ] DB flag `submissions_open` (default true); widget polls it on load and every 30 seconds
- [ ] Admin API: `POST /admin/kill`, `POST /admin/resume` (token-auth)
- [ ] Single-page mobile-friendly admin dashboard (kill/resume buttons, recent activity, current spend, revert button)
- [ ] ntfy.sh (or Pushover) integration: alert on widget validation failures, moderation flag spikes, spend approaching cap, CI failures
- [ ] One-click revert: button calls GitHub API to revert the last merge commit; triggers redeploy
- [ ] Spend cap enforcement: queue worker checks `spend_tracker` before processing each submission
- [ ] Admin token rotation reminder (annual or quarterly)

### Notes
This is the safety net you cash in if pure automation produces something bad. Build it before public launch.

---

## Epic 9: Privacy, Legal & Launch Prep

**Phase:** 2
**Labels:** `epic`, `phase-2`, `area-infra`
**Depends on:** All previous epics

### Goal
Project launches with clear privacy practices, basic legal hygiene, polished documentation, and a soft-launch plan that catches issues before public visibility.

### Acceptance Criteria
- Privacy page written in plain English explaining data handling.
- No third-party trackers; analytics is either privacy-preserving (Plausible / Umami) or absent.
- README pitches the project, explains how it works, lists current limitations, links to the time machine.
- Soft launch tested with 3–5 trusted people before any public sharing.

### Stories
- [ ] Write privacy notice (one page, plain English: what we collect, why, when we delete it, what we never do)
- [ ] Link privacy notice from widget footer
- [ ] Decide analytics approach (recommend: none for v1, add later if needed) and implement
- [ ] Polish `README.md`: pitch, how it works, how to submit, what won't be implemented, known limitations, link to live site
- [ ] Soft launch checklist (test from clean browser, mobile device, slow connection, with and without email)
- [ ] Invite 3–5 trusted testers; collect feedback for one week
- [ ] Iterate on the moderation prompt based on real submissions
- [ ] Decide on domain (continue on `vercel.app` subdomain or buy `tinker.zone`)
- [ ] Public launch plan: where to share (Hacker News? Personal channels?), what to say, what to expect

### Notes
Resist the urge to launch publicly before soft launch. The first 50 real submissions will teach you more about moderation gaps than any amount of pre-launch theorising.

---

## Phase 3 backlog (not detailed)

Captured here so they don't get lost. Each becomes a future epic when prioritised:

- **Voting queue** — show submission queue publicly, let people upvote; top-voted gets implemented first
- **Themes / seasons** — every N days the canvas resets to a new starting state; prevents drift to chaos
- **Featured snapshots** — curated "hall of fame" of moments worth revisiting
- **"Surprise me"** — if no submissions in 24h, Claude Code does a small autonomous edit
- **Fork** — let people download current canvas state as a zip to run their own version
- **Diff view in time machine** — side-by-side before/after for each change
- **Side-channel input** — accept submissions via email reply or other channels

---

## Open questions

These need decisions before or during Phase 1:

1. **Canvas v0 title** — what does the blank canvas actually say? "tinker.zone" / a date / something else?
2. **Daily implementation cap** — start with 1/day, 2/day, or something else? Driven by spend tolerance.
3. **Soft-launch testers** — who are the 3–5 people who'll break this first?
4. **Domain timing** — keep `tinker.zone` un-bought until soft launch, or grab it now to prevent squatting?
