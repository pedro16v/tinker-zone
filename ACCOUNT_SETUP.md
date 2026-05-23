# Remaining account setup

Everything in the architecture works the moment these are set. Each is independent — you can stop at any line.

## Turnstile (Cloudflare) — bot defense for `/submit`

The server-side check is already wired: `/submit` calls `verifyTurnstile()` if `TURNSTILE_SECRET_KEY` is set in the Supabase function env. The widget side needs a small extension to render the challenge and pass the token (see TODO in `widget/widget.js`).

Steps:

1. [cloudflare.com → Turnstile → Add site](https://dash.cloudflare.com/?to=/:account/turnstile)
   - Domain: `tinker-zone.vercel.app` (and any custom domain you adopt later).
   - Widget mode: **Managed** (auto-selects challenge type).
2. Note the **Site key** (public) and **Secret key** (server-only).
3. In your terminal:
   ```
   echo "TURNSTILE_SECRET_KEY=<paste secret>" > /tmp/tz.env
   supabase secrets set --env-file /tmp/tz.env && rm /tmp/tz.env
   ```
4. Add the site key to `shared/runtime-config.json`:
   ```
   "turnstileSiteKey": "<paste site key>"
   ```
   …and extend `widget/widget.js` to render the Turnstile challenge (the CSP already allows `challenges.cloudflare.com`).

Until you do steps 3–4, `/submit` accepts submissions without a token; bot defense is the rate limiter alone.

## Resend — "your change is live" emails

The notification step in `deploy-confirm` already does the full thing: groups `notification_emails` rows by recipient, sends one summary email via Resend, deletes the address after a successful send. It's a no-op when `RESEND_API_KEY` is absent.

Steps:

1. [resend.com → API Keys → Create](https://resend.com/api-keys) → copy the key.
2. (Optional) Verify a sender domain in Resend → `Domains`. Until then, Resend's `onboarding@resend.dev` works for testing.
3. In your terminal:
   ```
   echo "RESEND_API_KEY=<paste>" > /tmp/tz.env
   # Optional: also set the verified-domain From address
   echo "RESEND_FROM=tinker.zone <hi@your-domain.com>" >> /tmp/tz.env
   supabase secrets set --env-file /tmp/tz.env && rm /tmp/tz.env
   ```

Then submit something with an email in the widget — once it bakes, you'll receive the email.

## Domain (when going public)

`tinker.zone` is unregistered today (verify before buying). Either keep the `*.vercel.app` URL or buy + point at Vercel:

1. Register `tinker.zone` at a registrar.
2. [vercel.com → project tinker-zone → Settings → Domains → Add](https://vercel.com/pedro16vs-projects/tinker-zone/settings/domains) → `tinker.zone`.
3. Follow Vercel's DNS instructions at the registrar.
4. Update `shared/runtime-config.json` and `vercel.json` CSP if anything references the bare host.
5. Update Turnstile (if configured) to include the new domain.

## Recap of what's already set up

These were done earlier; listed for completeness.

- GitHub repo (public, branch protection requiring `validate`, auto-merge on)
- Custom GitHub App `tinker-zone-bake-pedro16v` (Contents + Pull requests + Issues, Read/Write, installed on this repo only)
- GH secrets: `ANTHROPIC_API_KEY`, `GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY`, `VERCEL_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`
- GH variables: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Supabase project `ebtbzmjpumglqbyopifn` (Tokyo) — schema applied, RLS configured, Edge functions deployed (`/submit`, `/deploy-confirm`, `/admin`)
- Supabase function secrets: `ANTHROPIC_API_KEY`
- Vercel project linked + Deployment Protection off
