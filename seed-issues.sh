#!/usr/bin/env bash
# seed-issues.sh
#
# Bootstraps the tinker.zone repo with 9 epic-level GitHub issues + labels.
# Run ONCE. Re-running will create duplicate issues (labels are idempotent).
#
# Prereqs:
#   - GitHub CLI installed: https://cli.github.com
#   - Authenticated: `gh auth login`
#   - Repo already exists: https://github.com/pedro16v/tinker-zone
#
# Usage:
#   chmod +x seed-issues.sh
#   ./seed-issues.sh

set -euo pipefail

REPO="pedro16v/tinker-zone"

echo "==> Seeding labels in $REPO..."

# Idempotent: --force overwrites existing label colour/description
gh label create epic              --color "8B5CF6" --description "Top-level workstream"     --repo "$REPO" --force
gh label create phase-1           --color "10B981" --description "MVP"                       --repo "$REPO" --force
gh label create phase-2           --color "F59E0B" --description "Polish & safety"           --repo "$REPO" --force
gh label create phase-3           --color "6B7280" --description "Future / backlog"          --repo "$REPO" --force
gh label create area-frontend     --color "3B82F6" --description "Canvas, widget, UI"        --repo "$REPO" --force
gh label create area-backend      --color "EC4899" --description "DB, edge functions, API"   --repo "$REPO" --force
gh label create area-ci           --color "F97316" --description "Build, validation, tests"  --repo "$REPO" --force
gh label create area-safety       --color "EF4444" --description "Moderation, admin, limits" --repo "$REPO" --force
gh label create area-infra        --color "14B8A6" --description "Repo, hosting, secrets"    --repo "$REPO" --force
gh label create claude-task       --color "A855F7" --description "Picked up by Claude Code"  --repo "$REPO" --force
gh label create blocked           --color "991B1B" --description "Cannot proceed"            --repo "$REPO" --force
gh label create needs-discussion  --color "FCD34D" --description "Open question"             --repo "$REPO" --force

echo "==> Creating epic issues in $REPO..."

# ---------------------------------------------------------------------------
# Epic 1
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 1: Project Foundation" \
  --label "epic,phase-1,area-infra" \
  --body "## Goal
Set up the repo skeleton, deployment targets, and the architectural rules document (\`CLAUDE.md\`) that every future change must respect. This epic establishes the immutable scaffolding everything else depends on.

## Acceptance Criteria
- Repo directory structure clearly separates editable surface (\`/canvas/\`) from protected zones (\`/widget/\`, \`/history/\`, \`/scripts/\`, \`/.github/\`, \`/supabase/\`).
- Vercel project connected to repo with auto-deploy on \`main\` and preview deploys on PRs.
- Supabase project provisioned; connection strings stored in GitHub Actions secrets.
- \`CLAUDE.md\` exists and is exhaustive on what Claude Code may and may not touch.
- \`README.md\` pitches the project and lists required secrets.

## Stories
- [ ] Create directory skeleton: \`/canvas/\`, \`/widget/\`, \`/history/\`, \`/scripts/\`, \`/.github/\`, \`/supabase/\`
- [ ] Add \`.gitignore\`, \`LICENSE\`, basic \`README.md\`
- [ ] Provision Vercel project, connect to repo, enable PR preview deploys
- [ ] Provision Supabase project; record connection strings as GitHub Actions secrets
- [ ] Write \`CLAUDE.md\`: protected files list, editable surface, capability restrictions, CI gate description
- [ ] Document all required secrets in \`README.md\`
- [ ] Create issue and PR templates under \`.github/\`
- [ ] Create GitHub labels (done by this script)

## Notes
\`CLAUDE.md\` is the most important artefact of this epic. Treat it as a living document — every time we learn something new about what Claude Code should not do, it gets added."

# ---------------------------------------------------------------------------
# Epic 2
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 2: The Site (Canvas + Widget + Build Pipeline)" \
  --label "epic,phase-1,area-frontend" \
  --body "## Goal
Deliver the user-facing site: a blank canvas as v0, an always-visible draggable widget injected via the build process, and the architectural separation that makes the widget tamper-proof regardless of what Claude Code does to the canvas.

## Acceptance Criteria
- Blank canvas loads at root URL with only a title.
- Widget appears (default: bottom-right), is draggable, and remains functional across all subsequent canvas changes.
- Build pipeline injects the widget into the canvas at deploy time — the widget is **not** stored inside any file Claude Code can edit.
- Widget renders inside a Shadow DOM (or equivalent isolation) so canvas CSS cannot bleed in.
- Widget self-heals: on runtime detection of being hidden, covered, or off-screen, it forces itself visible and pings a logging endpoint.
- Responsive at 375px, 768px, 1440px viewports.

## Stories
- [ ] Implement \`/canvas/canvas.html\` as the v0 state (title only)
- [ ] Decide and document the title text for v0
- [ ] Implement \`/widget/\` as a self-contained component (no framework)
- [ ] Implement \`/scripts/build.js\` that reads \`/canvas/\` and injects the widget at build time
- [ ] Implement widget Shadow DOM container with \`z-index\` from a CSS variable
- [ ] Implement draggable behaviour (mouse + touch); persist position in \`localStorage\`
- [ ] Implement submission textarea + submit button (with 500-char limit)
- [ ] Implement optional email field with discreet dismiss option
- [ ] Implement status display polling submission status from Supabase
- [ ] Implement runtime self-check loop (every 2s, check visibility, force if obscured)
- [ ] Implement time machine link inside widget
- [ ] Mobile responsive testing
- [ ] Document widget runtime API and contract in \`/widget/README.md\`

## Notes
The 'widget is built in, not stored in canvas files' pattern is the single most important architectural decision in this project. It is what makes pure automation defensible."

# ---------------------------------------------------------------------------
# Epic 3
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 3: Submission Pipeline (Database, Moderation, Rate Limiting)" \
  --label "epic,phase-1,area-backend,area-safety" \
  --body "## Goal
Accept submissions, moderate them with an LLM, rate-limit abuse, and queue approved ones for implementation. This is the first line of defence against malicious or low-quality prompts.

## Acceptance Criteria
- Submissions stored in Supabase with full status lifecycle (\`pending\` → \`approved\`/\`rejected\` → \`queued\` → \`building\` → \`live\`/\`failed\`).
- Cloudflare Turnstile blocks obvious bot traffic before the request hits moderation.
- Every submission moderated by Claude Haiku with a strict, documented system prompt.
- Rate limits enforced per IP hash and per email domain (hourly + daily windows).
- Queue selection logic picks 1–2 approved submissions per day for implementation.
- All cost-sensitive operations checked against monthly spend cap.

## Stories
- [ ] Design and create Supabase tables: \`submissions\`, \`rate_limits\`, \`email_queue\`, \`kill_switch\`, \`spend_tracker\`
- [ ] Write SQL migrations under \`/supabase/migrations/\`
- [ ] Create Supabase Edge Function: \`POST /submit\`
- [ ] Integrate Cloudflare Turnstile (server-side verification)
- [ ] Build moderation function (Claude Haiku with strict system prompt)
- [ ] Build rate limiter (IP hash + email domain windows)
- [ ] Build queue selection cron (daily; picks N approved submissions; marks \`queued\`)
- [ ] Implement spend tracker (log API calls with token count and cost)
- [ ] Implement spend cap enforcement
- [ ] Public submission feed endpoint
- [ ] Write moderation system prompt; maintain \`/supabase/moderation-tests.md\` with adversarial examples
- [ ] Document the moderation policy plainly

## Notes
The moderation prompt is the second most important artefact in this project (after \`CLAUDE.md\`). Budget real time to write it well and to maintain a regression test set of adversarial prompts."

# ---------------------------------------------------------------------------
# Epic 4
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 4: Claude Code Workflow (Issue → PR → Merge → Deploy)" \
  --label "epic,phase-1,area-backend,area-ci" \
  --body "## Goal
Wire up the automation: when a submission is queued, a GitHub issue is created; Claude Code Action picks it up, edits the canvas, opens a PR; CI runs; PR auto-merges if green; Vercel deploys; the submission record is updated.

## Acceptance Criteria
- Approved + queued submissions auto-create GitHub issues with the \`claude-task\` label and a link back to the submission ID.
- Claude Code Action picks up \`claude-task\` labelled issues automatically.
- Claude Code can only edit files within \`/canvas/\`; all other paths are read-only or invisible to it.
- PR is opened with submission ID, prompt, and preview URL.
- CI must pass before merge is allowed.
- Auto-merge enabled for passing PRs.
- Vercel deploy hook updates submission status to \`live\` and stores the immutable deploy URL.

## Stories
- [ ] Supabase webhook → GitHub API to create issue from queued submission
- [ ] Configure Claude Code GitHub Action (\`.github/workflows/claude.yml\`)
- [ ] Lock down Claude Code in \`CLAUDE.md\`: editable paths, no shell, no new deps without approval
- [ ] Write PR template
- [ ] Configure GitHub branch protection: required checks, auto-merge on green
- [ ] Vercel deploy webhook → Supabase function to mark submission \`live\` and capture deploy URL
- [ ] Failure handling: CI failure → mark \`failed\`, log reason, notify user
- [ ] Retry policy: max 1 retry per submission, then permanently abandon
- [ ] Document Claude Code's capabilities and restrictions inside \`CLAUDE.md\`

## Notes
This is where pure automation actually happens. Worth extra paranoid testing here before public traffic."

# ---------------------------------------------------------------------------
# Epic 5
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 5: Widget Validation & Content Safety CI" \
  --label "epic,phase-1,area-ci,area-safety" \
  --body "## Goal
Every PR is gated by automated checks that guarantee the widget remains functional and no malicious content has been introduced. This is the CI gate that makes pure automation survivable.

## Acceptance Criteria
- Playwright test suite runs on every PR.
- Widget presence, visibility, and interactivity verified at 3 viewport sizes.
- Adversarial CSS scenarios tested as fixtures.
- Content scanner blocks external scripts, suspicious fetch URLs, unapproved domains.
- Build must succeed for PR to merge.
- All CI scripts live under \`/scripts/\` or \`/.github/\` and are excluded from Claude Code's editable surface.

## Stories
- [ ] Set up Playwright in CI (\`.github/workflows/validate.yml\`)
- [ ] Test: widget DOM element exists after page load
- [ ] Test: widget is visible (\`getBoundingClientRect\` within viewport)
- [ ] Test: widget is on top (\`elementFromPoint\` at widget centre returns widget root)
- [ ] Test: submit button clickable, textarea accepts input
- [ ] Test: widget is draggable (simulate pointer drag, assert position changes)
- [ ] Test: widget survives \`window.scrollTo\` to bottom
- [ ] Test matrix: run all above at 375px, 768px, 1440px
- [ ] Fixtures: adversarial canvas pages (fullscreen overlays, huge fonts, fixed elements over corners, transform: scale)
- [ ] Content scanner: reject \`<script src='...'>\` to non-allowlisted domains
- [ ] Content scanner: reject \`fetch(\`, \`XMLHttpRequest\`, \`import(\` to non-allowlisted endpoints
- [ ] Content scanner: file size limits per file (~100 KB)
- [ ] Content scanner: HTML must be parseable
- [ ] Build verification step
- [ ] Document the full CI gate inside \`CLAUDE.md\`

## Notes
The adversarial fixtures are key — anyone clever testing this will find new ways to break the widget. Treat the fixtures as a living regression suite."

# ---------------------------------------------------------------------------
# Epic 6
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 6: Time Machine" \
  --label "epic,phase-2,area-frontend" \
  --body "## Goal
Users can browse the site's evolution, see past versions live in their browser, and link to specific moments in time.

## Acceptance Criteria
- \`/history/\` route displays a chronological list of all deployed versions.
- Each entry shows: timestamp, originating prompt, link to the live Vercel deploy URL.
- Permalink format: \`/history/{deploy_id}\`.
- Scrubber UI enables fast navigation through versions.

## Stories
- [ ] Implement \`/history/\` route (protected, not in editable scope)
- [ ] Query Supabase for all \`live\` submissions ordered by deploy time
- [ ] Embed historical versions in iframes pointing to Vercel deploy URLs
- [ ] Build scrubber component (timeline slider, keyboard nav)
- [ ] Implement permalink routing
- [ ] 'Open in new tab' link for each version
- [ ] (Optional) Capture screenshot in CI for thumbnail grid view
- [ ] (Optional) Side-by-side diff view of canvas HTML between versions

## Notes
Vercel's immutable per-deploy URLs make the time machine essentially free — no need to store snapshots ourselves. Just record \`{deploy_url, timestamp, prompt}\` in the DB."

# ---------------------------------------------------------------------------
# Epic 7
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 7: Notifications & Email" \
  --label "epic,phase-1,area-backend" \
  --body "## Goal
Users who left an email get notified when their change ships. Pedro gets a daily digest of activity.

## Acceptance Criteria
- Resend integration sends emails on successful deploy.
- Email template is clean, lightly branded, includes prompt + deploy link + time machine link.
- Emails sent only after deploy is verified live (not just merged).
- Daily digest to Pedro summarises submissions, builds, rejections, anomalies.
- Email addresses deleted from DB after notification sent (or after 30 days, whichever first).

## Stories
- [ ] Resend account setup + domain verification
- [ ] Email template ('Your change is live!') with prompt + deploy URL + time machine link + plain-text fallback
- [ ] Trigger function: on deploy success, send email if address exists
- [ ] On successful send, mark email as sent and delete the address field
- [ ] Daily digest cron: summarise 24h activity, email Pedro
- [ ] Nightly email deletion job (purge any email older than 30 days)
- [ ] Handle Resend bounce webhook (log, do not retry)

## Notes
Phase 1 includes user notifications. The daily digest can slip to Phase 2 if needed but is genuinely useful early."

# ---------------------------------------------------------------------------
# Epic 8
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 8: Safety Net & Admin Controls" \
  --label "epic,phase-2,area-safety" \
  --body "## Goal
Pedro can intervene fast when things go sideways, without needing a laptop. Spend is hard-capped. Rollback is one click.

## Acceptance Criteria
- Kill switch endpoint toggles \`submissions_open\` flag in DB; widget reflects state within 10 seconds.
- Admin alerts via ntfy.sh (or Pushover) on critical events.
- One-click revert deployable from a mobile-friendly admin page.
- Anthropic spend hard-capped at \$10/month; queue freezes when 90% of cap reached.
- All admin endpoints require an admin token.

## Stories
- [ ] DB flag \`submissions_open\` (default true); widget polls on load and every 30s
- [ ] Admin API: \`POST /admin/kill\`, \`POST /admin/resume\` (token-auth)
- [ ] Single-page mobile-friendly admin dashboard
- [ ] ntfy.sh integration: alert on validation failures, moderation spikes, spend approaching cap, CI failures
- [ ] One-click revert: button calls GitHub API to revert last merge commit
- [ ] Spend cap enforcement (queue worker checks before processing)
- [ ] Admin token rotation reminder (quarterly)

## Notes
This is the safety net you cash in if pure automation produces something bad. Build it before public launch."

# ---------------------------------------------------------------------------
# Epic 9
# ---------------------------------------------------------------------------
gh issue create --repo "$REPO" \
  --title "Epic 9: Privacy, Legal & Launch Prep" \
  --label "epic,phase-2,area-infra" \
  --body "## Goal
Project launches with clear privacy practices, basic legal hygiene, polished documentation, and a soft-launch plan that catches issues before public visibility.

## Acceptance Criteria
- Privacy page written in plain English explaining data handling.
- No third-party trackers; analytics is either privacy-preserving or absent.
- README pitches the project, explains how it works, lists current limitations, links to time machine.
- Soft launch tested with 3–5 trusted people before public sharing.

## Stories
- [ ] Write privacy notice (one page, plain English)
- [ ] Link privacy notice from widget footer
- [ ] Decide analytics approach (recommend: none for v1) and implement
- [ ] Polish \`README.md\`: pitch, how it works, how to submit, known limitations, live link
- [ ] Soft launch checklist (clean browser, mobile, slow connection, with/without email)
- [ ] Invite 3–5 trusted testers; collect feedback for one week
- [ ] Iterate on moderation prompt based on real submissions
- [ ] Decide on domain (vercel.app subdomain vs buy \`tinker.zone\`)
- [ ] Public launch plan (where to share, what to say, what to expect)

## Notes
Resist the urge to launch publicly before soft launch. The first 50 real submissions will teach you more about moderation gaps than any amount of pre-launch theorising."

echo ""
echo "==> Done. Created 9 epics in $REPO."
echo "    View: https://github.com/$REPO/issues?q=is%3Aissue+label%3Aepic"
