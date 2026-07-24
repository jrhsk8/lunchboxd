# Deploy — static folder on Gambdle's GitHub Pages + shared hosted Supabase

Live at <https://gambdle.net/lunchboxd/>. Two halves: a static frontend served as a folder of the Gambdle GitHub Pages repo, and a backend riding in Gambdle's hosted Supabase project, isolated in the `lunchboxd` schema. Deploy is a deliberate manual step, never automated on push.

## Frontend

`.env.production` (committed; the anon key is public by design) supplies the hosted credentials and takes priority over `.env.local` in production builds. `vite.config.ts` sets `base: '/lunchboxd/'`.

```
npm run build
# replace the folder in the Pages repo and push (stage ONLY lunchboxd/ — the
# Gambdle repo may have unrelated work in progress)
rm -r ../Documents/GitHub/Gambdle/lunchboxd; cp -r dist ../Documents/GitHub/Gambdle/lunchboxd
cd ../Documents/GitHub/Gambdle && git add lunchboxd && git commit -m "Deploy lunchboxd" && git push
```

Pages rebuilds in a minute or two; confirm the new asset hash appears in the live page source.

## Backend (hosted Supabase, project `kxbteesmfozqzoxzktzv`)

Schema changes go through `supabase/migrations/` and are applied with the Supabase Management API (PAT in `~/.claude.json`, the same one Gambdle's `supabase/deploy-fn.js` uses). Nothing may touch the `public` schema — it belongs to Gambdle.

One-time hosted config, already done (redo only if the project is rebuilt):

- `lunchboxd` added to PostgREST's exposed schemas (Dashboard / Management API).
- Anonymous sign-ins enabled.
- Site URL and redirect allow-list include `https://gambdle.net/lunchboxd/` (the Site URL itself is Gambdle's — see the email-redirect rule in [../app/auth.md](../app/auth.md)).
- Custom SMTP via Resend (2026-07-23): host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `"Lunchboxd" <no-reply@maxout.art>`, `rate_limit_email_sent` 30/hour. The Resend account is the shared maxout one (its free-plan single-domain slot holds maxout.art, which is why lunchboxd sends from that domain — owner-accepted trade-off; see decisions.md). Three deliverability lessons, each proven necessary by controlled tests:
  - Without custom SMTP, Supabase's built-in mailer caps at 2 emails/hour project-wide and barely delivers to non-team addresses — the symptom is users reporting "I never got the email".
  - The sender must be `no-reply@maxout.art` (delivery history). Gmail silently discarded everything from the never-before-seen `lunchboxd@maxout.art` — accepted at SMTP (SES "delivered") then binned with no spam-folder trace.
  - The auth email templates must be the branded ones set in the Dashboard/Management API, not Supabase's defaults. The skeletal default ("Follow this link to login" + bare `<ref>.supabase.co` link) was also silently binned by Gmail even from the good sender; the branded rewrite delivers in seconds.
  - **Gotcha:** the Management API PATCH for `smtp_*` is all-or-nothing — patching one smtp field alone wipes the rest and drops `rate_limit_email_sent` back to 2. Always send the complete smtp block. Config changes take a couple of minutes to propagate to GoTrue; don't judge a test email sent within ~2 minutes of a config change.

## Repos and remotes

The app repo's `origin` is the local gitea (`http://localhost:3000/jrhsk8/lunchboxd.git`). The Gambdle Pages repo is at `../Documents/GitHub/Gambdle` with `origin` on GitHub.

## Local development backend

Don't use WSL for this project (owner-ruled 2026-07-23). A local Supabase stack previously ran in WSL at `~/lunchboxd-db` (Docker lives WSL-side on this machine) and may still exist there, but new work shouldn't depend on it. For verification, read-only flows can run against the production backend with the `.env.production` credentials; if a writable local backend becomes necessary, pick a Windows-side approach with the owner first.
