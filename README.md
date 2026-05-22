# tinker.zone

A public, collaborative website that anyone can reshape with a natural-language prompt. You type what you want changed; moderation and automation do the rest; the site evolves in near-real-time and remembers every version.

**Status:** under construction. See [`EPICS.md`](./EPICS.md) for the full plan and milestones, and [`CLAUDE.md`](./CLAUDE.md) for the automation's operating contract.

## How it works

1. You submit a prompt in the on-page widget.
2. It's checked (Cloudflare Turnstile + LLM moderation) and, if safe, turned into a small **live patch** that everyone sees applied within seconds — the *live layer*.
3. Periodically, accumulated changes are **baked** into the durable site: a GitHub issue is opened, Claude Code implements it into `/canvas/`, CI validates it, it auto-merges, Vercel deploys it, and the version is recorded in the **time machine**.

The architecture ("Option 2") deliberately separates an instant, ephemeral live layer from a slower, durable, CI-gated canonical layer. A tamper-proof widget is injected at build time and cannot be removed by the automation.

## Architecture at a glance

- **Canonical layer** — `/canvas/` source, built and deployed to Vercel; the only thing the automation can edit.
- **Live layer** — declarative patches broadcast via Supabase Realtime and applied in-browser; ephemeral, reset on each bake.
- **Safety** — strict CSP at the edge, a hard CI "diff-scope" gate, a privilege-separated bake token, LLM moderation, rate limiting, and a kill switch.

## Required secrets

Stored in **GitHub Actions secrets** and/or **Supabase function env** (never committed):

| Secret | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | bake Action, Edge functions | Claude Code + moderation + patch generation |
| `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID` | bake Action | Scoped (Contents + Pull-Requests only) GitHub App token |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | client, Edge functions | DB + Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | Privileged DB writes |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | widget, /submit | Bot protection |
| `RESEND_API_KEY` | notifications | "Your change is live" emails + daily digest |
| `ADMIN_TOKEN` | /admin | Kill switch, revert, spend controls |
| `NTFY_TOPIC` (or `PUSHOVER_*`) | alerts | Push alerts on anomalies |

## Development

Coming with milestone M1: local build + tests via `npm run build` and `npm test`.

## License

MIT — see [`LICENSE`](./LICENSE).
