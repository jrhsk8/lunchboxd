# Deploy — Cloudflare Pages on lunchboxd.live + shared hosted Supabase

Live at <https://lunchboxd.live/>. Two halves: a static frontend on Cloudflare Pages (its own apex domain), and a backend riding in Gambdle's hosted Supabase project, isolated in the `lunchboxd` schema. Deploy is a deliberate manual step, never automated on push. The old `gambdle.net/lunchboxd/` URL now serves a redirect stub (below).

## Frontend (Cloudflare Pages, project `lunchboxd`)

`.env.production` (committed; the anon key is public by design) supplies the hosted credentials and takes priority over `.env.local` in production builds. `vite.config.ts` sets `base: '/'` — the app serves from the domain root, so the BASE_URL-derived `emailRedirectTo` resolves to `https://lunchboxd.live/`.

Deploy with Wrangler direct upload (keeps deploy a deliberate manual step; the app repo lives on the local gitea, not GitHub, so there's no Git-connected auto-build):

```
npm run build
npx wrangler pages deploy dist --project-name lunchboxd
```

Confirm the new asset hash appears in the live page source. Routing is hash-based, so no SPA-fallback / `_redirects` config is needed — every path is served from the root `index.html`.

One-time setup (redo only if rebuilt): the `lunchboxd` Pages project exists in the Cloudflare account; `lunchboxd.live` is a Cloudflare zone (nameservers moved off Squarespace) with the apex added as the project's custom domain (Cloudflare CNAME-flattens the apex and provisions TLS).

## Old URL redirect (gambdle.net/lunchboxd)

The Gambdle Pages folder now holds a one-file redirect stub — `deploy/gambdle-redirect/index.html` in this repo — that forwards to lunchboxd.live carrying `location.hash`, so deep links (`#/c/<name>`, `#/u/<handle>`) survive. Deploy it **once, only after lunchboxd.live is verified live**, replacing the app folder (stage ONLY `lunchboxd/` — the Gambdle repo may have unrelated work in progress):

```
rm -r ../Documents/GitHub/Gambdle/lunchboxd
cp -r deploy/gambdle-redirect ../Documents/GitHub/Gambdle/lunchboxd
cd ../Documents/GitHub/Gambdle && git add lunchboxd && git commit -m "Redirect lunchboxd to lunchboxd.live" && git push
```

## Backend (hosted Supabase, project `kxbteesmfozqzoxzktzv`)

Schema changes go through `supabase/migrations/` and are applied with the Supabase Management API (PAT in `~/.claude.json`, the same one Gambdle's `supabase/deploy-fn.js` uses). Nothing may touch the `public` schema — it belongs to Gambdle.

One-time hosted config, already done (redo only if the project is rebuilt):

- `lunchboxd` added to PostgREST's exposed schemas (Dashboard / Management API).
- Anonymous sign-ins enabled.
- Redirect allow-list includes `https://lunchboxd.live/` (and still `https://gambdle.net/lunchboxd/` for the transition). The Site URL itself stays Gambdle's — it's the shared project's single global value, so it can't be pointed at lunchboxd.live without breaking Gambdle; hence `emailRedirectTo` remains mandatory. See the email-redirect rule in [../app/auth.md](../app/auth.md).
- Custom SMTP via Resend (2026-07-23): host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `"Lunchboxd" <no-reply@maxout.art>`, `rate_limit_email_sent` 30/hour. The Resend account is the shared maxout one (its free-plan single-domain slot holds maxout.art, which is why lunchboxd sends from that domain — owner-accepted trade-off; see decisions.md). Three deliverability lessons, each proven necessary by controlled tests:
  - Without custom SMTP, Supabase's built-in mailer caps at 2 emails/hour project-wide and barely delivers to non-team addresses — the symptom is users reporting "I never got the email".
  - The sender must be `no-reply@maxout.art` (delivery history). Gmail silently discarded everything from the never-before-seen `lunchboxd@maxout.art` — accepted at SMTP (SES "delivered") then binned with no spam-folder trace.
  - The auth email templates must be the branded ones set in the Dashboard/Management API, not Supabase's defaults. The skeletal default ("Follow this link to login" + bare `<ref>.supabase.co` link) was also silently binned by Gmail even from the good sender; the branded rewrite delivers in seconds.
  - **Gotcha:** the Management API PATCH for `smtp_*` is all-or-nothing — patching one smtp field alone wipes the rest and drops `rate_limit_email_sent` back to 2. Always send the complete smtp block. Config changes take a couple of minutes to propagate to GoTrue; don't judge a test email sent within ~2 minutes of a config change.

## Repos and remotes

The app repo's `origin` is the local gitea (`http://localhost:3000/jrhsk8/lunchboxd.git`). The Gambdle Pages repo is at `../Documents/GitHub/Gambdle` with `origin` on GitHub.

## Local development backend

Don't use WSL for this project (owner-ruled 2026-07-23). A local Supabase stack previously ran in WSL at `~/lunchboxd-db` (Docker lives WSL-side on this machine) and may still exist there, but new work shouldn't depend on it. For verification, read-only flows can run against the production backend with the `.env.production` credentials; if a writable local backend becomes necessary, pick a Windows-side approach with the owner first.
