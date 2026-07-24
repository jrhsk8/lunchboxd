# Deploy — Cloudflare Pages on lunchboxd.live + shared hosted Supabase

Live at <https://lunchboxd.live/>. Two halves: a static frontend on Cloudflare Pages (its own apex domain), and a backend riding in Gambdle's hosted Supabase project, isolated in the `lunchboxd` schema. Deploy is a deliberate manual step, never automated on push. The old `gambdle.net/lunchboxd/` URL now serves a redirect stub (below).

## Frontend (Cloudflare Pages, project `lunchboxd`)

`.env.production` (committed; the anon key is public by design) supplies the hosted credentials and takes priority over `.env.local` in production builds. `vite.config.ts` sets `base: '/'` — the app serves from the domain root, so the BASE_URL-derived `emailRedirectTo` resolves to `https://lunchboxd.live/`.

Deploy with Wrangler direct upload (keeps deploy a deliberate manual step; the app repo lives on the local gitea, not GitHub, so there's no Git-connected auto-build):

```
npm run build
npx wrangler pages deploy dist --project-name lunchboxd
```

**Node version gotcha (as of 2026-07-24):** this box runs Node v20.13.1 and wrangler isn't a project dependency, so `npx wrangler` fetches the latest, which hard-requires Node ≥ 22 and refuses to start. Either upgrade Node, or pin a version that still supports Node 20: `npx wrangler@3 pages deploy dist --project-name lunchboxd`.

Confirm the new asset hash appears in the live page source. Routing is hash-based, so no SPA-fallback / `_redirects` config is needed — every path is served from the root `index.html`.

One-time setup, completed 2026-07-24 (redo only if rebuilt): the `lunchboxd` Pages project exists in the Cloudflare account; `lunchboxd.live` is a Cloudflare zone (nameservers moved off Squarespace) with the apex and `www` added as the project's custom domains. The apex is a proxied `CNAME` to `lunchboxd.pages.dev` — Cloudflare CNAME-flattens it and provisions TLS.

Three things that cost hours on the day, each worth knowing before repeating this:

- **Squarespace can show saved nameservers it never submitted to the registry.** Their nameserver page displayed both Cloudflare nameservers, with a "Nameservers updated" confirmation, while the `.live` registry still delegated to `nsd1-4.squarespacedns.com` two hours later. Logging out of Squarespace, back in, and re-saving is what actually pushed it; delegation landed within minutes. Don't read the registrar UI as proof — check the registry itself: `nslookup -type=ns -norecurse lunchboxd.live v0n0.nic.live`, or RDAP (`https://rdap.org/domain/lunchboxd.live`), whose `last changed` timestamp tells you whether the update has been submitted at all.
- **Adding the Pages custom domain does not write DNS if conflicting records exist.** The domain attaches as `pending` and silently creates nothing. Delete the registrar's imported records first (here: four Squarespace apex `A` records and the `www` CNAME to `ext-sq.squarespace.com`), then create the proxied `CNAME`s to `lunchboxd.pages.dev` by hand if Pages hasn't.
- **The zone's activation check runs on a slow retry cycle.** After delegation flips, the zone can sit at `pending` — and TLS won't issue, so the site fails the handshake — until "Check nameservers now" forces a recheck.

Keep the `_dmarc` (`p=reject`), `_domainkey`, and `v=spf1 -all` TXT records. The domain sends no mail (auth email goes out from maxout.art via Resend), so they exist purely to block spoofing.

## Old URL redirect (gambdle.net/lunchboxd)

The Gambdle Pages folder now holds a one-file redirect stub — `deploy/gambdle-redirect/index.html` in this repo — that forwards to lunchboxd.live carrying `location.hash`, so deep links (`#/c/<name>`, `#/u/<handle>`) survive. **Deployed 2026-07-24** (Gambdle commit `ccf5da3`), replacing the app folder. The recipe below is kept for reference — it only needs rerunning if the stub itself changes. Stage ONLY `lunchboxd/`; the Gambdle repo may have unrelated work in progress.

Because the stub carries the hash, it also rescues auth links: the shared project's Site URL is still `https://gambdle.net/lunchboxd/`, so any GoTrue fallback to Site URL lands here and forwards to lunchboxd.live with the token intact.

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
- Redirect allow-list (`uri_allow_list`) holds, as of 2026-07-24: `https://gambdle.net/lunchboxd/`, `http://localhost:5173/lunchboxd/`, `http://localhost:4173/lunchboxd/`, `https://lunchboxd.live/`, `https://www.lunchboxd.live/`, `http://localhost:5173/`, `http://localhost:4173/`. The root-path entries are the live ones — `emailRedirectTo` is `window.location.origin + BASE_URL` and `base` is now `/`, so it resolves to `https://lunchboxd.live/` in production and `http://localhost:5173/` in dev. The `/lunchboxd/`-suffixed entries are leftovers from the old base path, kept only for the transition. **A redirect that isn't on this list is not an error** — GoTrue silently falls back to the Site URL, so a missed entry looks like a working site that quietly mails users to gambdle.net. Verify by reading `redirect_to` in a real sign-in email, not by watching for a failure. The Site URL itself stays Gambdle's — it's the shared project's single global value, so it can't be pointed at lunchboxd.live without breaking Gambdle; hence `emailRedirectTo` remains mandatory. See the email-redirect rule in [../app/auth.md](../app/auth.md).
- Custom SMTP via Resend (2026-07-23): host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `"Lunchboxd" <no-reply@maxout.art>`, `rate_limit_email_sent` 30/hour. The Resend account is the shared maxout one (its free-plan single-domain slot holds maxout.art, which is why lunchboxd sends from that domain — owner-accepted trade-off; see decisions.md). Three deliverability lessons, each proven necessary by controlled tests:
  - Without custom SMTP, Supabase's built-in mailer caps at 2 emails/hour project-wide and barely delivers to non-team addresses — the symptom is users reporting "I never got the email".
  - The sender must be `no-reply@maxout.art` (delivery history). Gmail silently discarded everything from the never-before-seen `lunchboxd@maxout.art` — accepted at SMTP (SES "delivered") then binned with no spam-folder trace.
  - The auth email templates must be the branded ones set in the Dashboard/Management API, not Supabase's defaults. The skeletal default ("Follow this link to login" + bare `<ref>.supabase.co` link) was also silently binned by Gmail even from the good sender; the branded rewrite delivers in seconds.
  - **Gotcha:** the Management API PATCH for `smtp_*` is all-or-nothing — patching one smtp field alone wipes the rest and drops `rate_limit_email_sent` back to 2. Always send the complete smtp block. Config changes take a couple of minutes to propagate to GoTrue; don't judge a test email sent within ~2 minutes of a config change.

## Repos and remotes

The app repo's `origin` is the local gitea (`http://localhost:3000/jrhsk8/lunchboxd.git`). The Gambdle Pages repo is at `../Documents/GitHub/Gambdle` with `origin` on GitHub.

## Local development backend

Don't use WSL for this project (owner-ruled 2026-07-23). A local Supabase stack previously ran in WSL at `~/lunchboxd-db` (Docker lives WSL-side on this machine) and may still exist there, but new work shouldn't depend on it. For verification, read-only flows can run against the production backend with the `.env.production` credentials; if a writable local backend becomes necessary, pick a Windows-side approach with the owner first.
