# tinker.zone

A public, collaborative website that anyone can reshape with a natural-language prompt. You type what you want changed; moderation and automation do the rest; the site evolves in near-real-time and remembers every version.

**Live at https://tinker-zone.vercel.app** · **History at https://tinker-zone.vercel.app/history**

## How it works

1. You submit a prompt in the on-page widget.
2. It's checked (LLM moderation; Cloudflare Turnstile if configured) and, if safe, turned into a small **live patch** that everyone sees applied within ~2 seconds — the *live layer*.
3. Periodically, accumulated changes are **baked** into the durable site: a GitHub issue is opened, Claude Code implements it into `/canvas/`, CI validates it, it auto-merges, Vercel deploys it, and the version is recorded in the **time machine**.

The architecture ("Option 2") deliberately separates an instant, ephemeral live layer from a slower, durable, CI-gated canonical layer. A tamper-proof widget is injected at build time and cannot be removed by the automation.

## Architecture at a glance

- **Canonical layer** — `/canvas/` source, built and deployed to Vercel; the only thing the automation can edit.
- **Live layer** — declarative patches broadcast via Supabase Realtime and applied in-browser; ephemeral, reset on each bake.
- **Safety**
  - Strict CSP at the edge — `tests/csp.spec.ts` asserts non-allowlisted hosts are blocked.
  - Hard CI "diff-scope" gate — only `/canvas/**` may change in any PR; required status check.
  - Privilege-separated bake token — a custom GitHub App scoped to Contents + Pull requests + Issues only.
  - LLM moderation in `/submit` before any live broadcast.
  - Per-IP rate limiting via Supabase RPC.
  - Adversarial Playwright fixtures keep the widget surviving hostile canvas states.
  - Admin Edge function (`/admin`) for kill switch / fail batch / force reset.

## Layout

```
canvas/        ★ editable by the bake (only path the diff-scope gate allows)
widget/        🔒 tamper-proof widget runtime, bundled at build with @supabase/supabase-js
shared/        🔒 patch JSON schema + runtime config
scripts/       🔒 build, content scanner, diff-scope gate, static server
tests/         🔒 Playwright tests (widget, validator, live layer, fixtures, CSP)
supabase/      🔒 SQL migrations + Edge functions (/submit, /deploy-confirm, /admin)
api/           🔒 (placeholder)
history/       🔒 time machine route
privacy/       🔒 privacy notice
.github/       🔒 CI workflows (validate, claude-bake, automerge, deploy, bake-trigger)
public/        build output (gitignored)
```

## Status

| Milestone | |
|---|---|
| M0 Foundation + repo + protection | ✅ |
| M1 Canonical site + safe automation loop | ✅ |
| M2 Live layer | ✅ |
| M3 Submission + fast patch-gen | ✅ |
| M4 Batched bake (closes durable loop) | ✅ |
| M5 Safety hardening + admin | ✅ |
| M6 Notifications + time machine | ✅ (Resend ready, set `RESEND_API_KEY` to activate) |
| M7 Privacy + soft launch | ✅ docs ready; see [SOFT_LAUNCH.md](./SOFT_LAUNCH.md) |

Pending external accounts: [ACCOUNT_SETUP.md](./ACCOUNT_SETUP.md) — Turnstile (bot defense) and Resend (emails).

## Required secrets

Stored in **GitHub Actions secrets** and **Supabase function env** (never committed):

| Secret | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | GH + Supabase | Claude Code bake + moderation + patch generation |
| `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID` | GH | Scoped GitHub App token |
| `SUPABASE_SERVICE_ROLE_KEY` | GH | Bake-trigger cron + deploy-confirm |
| `VERCEL_TOKEN` | GH | Deploy from Actions |
| `TURNSTILE_SECRET_KEY` | Supabase | (optional) Bot defense |
| `RESEND_API_KEY`, `RESEND_FROM` | Supabase | (optional) "Your change is live" emails |

## Development

- `npm run build` — copy `canvas/` to `public/`, bundle widget with esbuild, copy `history/` + `privacy/`.
- `npm test` — 42-test Playwright suite (widget + validator + live-layer + adversarial fixtures + CSP).
- `node scripts/serve.js` — preview locally at `http://localhost:8765` with the same CSP Vercel applies in production.

## License

MIT — see [LICENSE](./LICENSE).
