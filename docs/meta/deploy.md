# Deploy — Cloudflare Pages on lunchboxd.live + shared hosted Supabase

Live at <https://lunchboxd.live/>. Two halves: a static frontend on Cloudflare Pages (its own apex domain), and a backend riding in Gambdle's hosted Supabase project, isolated in the `lunchboxd` schema. Deploy is a deliberate manual step, never automated on push, and goes to Cloudflare only — this repo no longer deploys anything to Gambdle. The old `gambdle.net/lunchboxd/` URL serves a redirect stub that Gambdle now owns outright (below).

## Frontend (Cloudflare Pages, project `lunchboxd`)

`.env.production` (committed; the anon key is public by design) supplies the hosted credentials and takes priority over `.env.local` in production builds. `vite.config.ts` sets `base: '/'` — the app serves from the domain root, so the BASE_URL-derived `emailRedirectTo` resolves to `https://lunchboxd.live/`.

Deploy with Wrangler direct upload (keeps deploy a deliberate manual step; the app repo lives on the local gitea, not GitHub, so there's no Git-connected auto-build):

```
npm run build
npm run deploy
```

`deploy` is `wrangler pages deploy dist --project-name lunchboxd`, and **wrangler is a pinned devDependency** — so the invocation lives in one place and can't drift. Run `npm run check` (format, lint, build, test) before deploying.

**History, not a live instruction:** until 2026-07-25 this box ran Node v20.13.1 with wrangler unpinned, so `npx wrangler` fetched the latest, which hard-requires Node ≥ 22 and refused to start; the documented workaround was `npx wrangler@3`. Node is now 24 LTS and wrangler is pinned at ^4, which fixes it from both ends. If you see a Node-version refusal again, check `node -v` before anything else.

Confirm the new asset hash appears in the live page source. Routing is hash-based, so no SPA-fallback / `_redirects` config is needed — every path is served from the root `index.html`.

One-time setup, completed 2026-07-24 (redo only if rebuilt): the `lunchboxd` Pages project exists in the Cloudflare account; `lunchboxd.live` is a Cloudflare zone (nameservers moved off Squarespace) with the apex and `www` added as the project's custom domains. The apex is a proxied `CNAME` to `lunchboxd.pages.dev` — Cloudflare CNAME-flattens it and provisions TLS.

Three things that cost hours on the day, each worth knowing before repeating this:

- **Squarespace can show saved nameservers it never submitted to the registry.** Their nameserver page displayed both Cloudflare nameservers, with a "Nameservers updated" confirmation, while the `.live` registry still delegated to `nsd1-4.squarespacedns.com` two hours later. Logging out of Squarespace, back in, and re-saving is what actually pushed it; delegation landed within minutes. Don't read the registrar UI as proof — check the registry itself: `nslookup -type=ns -norecurse lunchboxd.live v0n0.nic.live`, or RDAP (`https://rdap.org/domain/lunchboxd.live`), whose `last changed` timestamp tells you whether the update has been submitted at all.
- **Adding the Pages custom domain does not write DNS if conflicting records exist.** The domain attaches as `pending` and silently creates nothing. Delete the registrar's imported records first (here: four Squarespace apex `A` records and the `www` CNAME to `ext-sq.squarespace.com`), then create the proxied `CNAME`s to `lunchboxd.pages.dev` by hand if Pages hasn't.
- **The zone's activation check runs on a slow retry cycle.** After delegation flips, the zone can sit at `pending` — and TLS won't issue, so the site fails the handshake — until "Check nameservers now" forces a recheck.

Keep the `_dmarc` (`p=reject`), `_domainkey`, and `v=spf1 -all` TXT records. The domain sends no mail (auth email goes out from maxout.art via Resend), so they exist purely to block spoofing.

## Old URL redirect (gambdle.net/lunchboxd) — Gambdle's file, not ours

`gambdle.net/lunchboxd/` serves a one-file stub that forwards to lunchboxd.live, so old links and bookmarks survive. **That file lives in the Gambdle repo alone** (`lunchboxd/index.html`); a copy used to sit here at `deploy/gambdle-redirect/`, removed 2026-07-24. Nothing in this repo deploys to Gambdle any more — the only remaining tie between the two projects is the shared Supabase project below. Edit the stub there, in Gambdle's own deploy flow.

The stub must forward **`location.search + location.hash`**, and the reason is easy to get wrong. The hash carries deep links (`#/c/<name>`, `#/u/<handle>`). The query string carries the `?code=` of a Supabase auth link — the client uses supabase-js v2's default PKCE flow, which returns the token as a query parameter, not a fragment. Auth links land on the old URL whenever GoTrue falls back to the Site URL, which is still `https://gambdle.net/lunchboxd/` and can't be changed (see the redirect allow-list below). A hash-only forward therefore dropped the code silently and delivered people to lunchboxd.live signed out — the "the email link didn't work" report, shipped in Gambdle `ccf5da3` and fixed in `ba50c75`.

## Backend (hosted Supabase, project `kxbteesmfozqzoxzktzv`)

Schema changes go through `supabase/migrations/` and are applied with the Supabase Management API (PAT in `~/.claude.json`, the same one Gambdle's `supabase/deploy-fn.js` uses). Nothing may touch the `public` schema — it belongs to Gambdle.

```
npm run backup                                        # before anything destructive
node supabase/apply.js migrations/<file>.sql          # apply one migration
node supabase/apply.js -e "select count(*) from lunchboxd.rankings"
npm run types                                         # regenerate src/database.types.ts
```

There is **no local Supabase stack** (WSL is ruled out), so the hosted database is the only target and migrations land in production the moment they're applied. Back up first, and check destructive statements against live data before running them — `apply.js -e` is there for exactly that.

`npm run types` must follow any migration that changes a table or view: `src/database.types.ts` is generated, and it's what stops a renamed column compiling clean and failing at runtime.

### Backups and restore

`npm run backup` writes every row of `lunchboxd.profiles`, `categories` and `rankings` to a timestamped JSON file in `../lunchboxd-backups/` — **outside the repo**, because it holds every user's handle and every ranking. It is a data dump, not a schema dump: `supabase/migrations/` is the schema, so migrations + a dump is a complete restore.

Why not `pg_dump`: a project-level restore would drag Gambdle back to the same point, so the backup has to be schema-scoped — and this box has no `pg_dump`, `psql` or Supabase CLI binary. If you install one, `pg_dump --schema=lunchboxd` is the better artifact and this script becomes the fallback.

To restore a table, feed the JSON back through `apply.js` as inserts, or `POST` it to PostgREST with the service key. Nothing automates this yet, and nothing schedules the backup — it's a manual step before anything destructive. **Take one before every ban:** `ban_profile` deletes the target's rankings _and_ every category they invented, cascading away everyone else's rankings in those categories, with no undo.

One-time hosted config, already done (redo only if the project is rebuilt):

- `lunchboxd` added to PostgREST's exposed schemas (Dashboard / Management API).
- Anonymous sign-ins enabled.
- Redirect allow-list (`uri_allow_list`) holds, as of 2026-07-24: `https://gambdle.net/lunchboxd/`, `http://localhost:5173/lunchboxd/`, `http://localhost:4173/lunchboxd/`, `https://lunchboxd.live/`, `https://www.lunchboxd.live/`, `http://localhost:5173/`, `http://localhost:4173/`. The root-path entries are the live ones — `emailRedirectTo` is `window.location.origin + BASE_URL` and `base` is now `/`, so it resolves to `https://lunchboxd.live/` in production and `http://localhost:5173/` in dev. The `/lunchboxd/`-suffixed entries are leftovers from the old base path, kept only for the transition. **A redirect that isn't on this list is not an error** — GoTrue silently falls back to the Site URL, so a missed entry looks like a working site that quietly mails people to gambdle.net. Verify by reading `redirect_to` in a real sign-in email, not by watching for a failure. The Site URL itself stays Gambdle's — it's the shared project's single global value, so it can't be pointed at lunchboxd.live without breaking Gambdle; hence `emailRedirectTo` remains mandatory. See the email-redirect rule in [../app/auth.md](../app/auth.md).
- Custom SMTP via Resend (2026-07-23): host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender `"Lunchboxd" <no-reply@maxout.art>`, `rate_limit_email_sent` 30/hour. The Resend account is the shared maxout one (its free-plan single-domain slot holds maxout.art, which is why lunchboxd sends from that domain — owner-accepted trade-off; see decisions.md). Three deliverability lessons, each proven necessary by controlled tests:
  - Without custom SMTP, Supabase's built-in mailer caps at 2 emails/hour project-wide and barely delivers to non-team addresses — the symptom is users reporting "I never got the email".
  - The sender must be `no-reply@maxout.art` (delivery history). Gmail silently discarded everything from the never-before-seen `lunchboxd@maxout.art` — accepted at SMTP (SES "delivered") then binned with no spam-folder trace.
  - The auth email templates must be the branded ones set in the Dashboard/Management API, not Supabase's defaults. The skeletal default ("Follow this link to login" + bare `<ref>.supabase.co` link) was also silently binned by Gmail even from the good sender; the branded rewrite delivers in seconds.
  - **Gotcha:** the Management API PATCH for `smtp_*` is all-or-nothing — patching one smtp field alone wipes the rest and drops `rate_limit_email_sent` back to 2. Always send the complete smtp block. Config changes take a couple of minutes to propagate to GoTrue; don't judge a test email sent within ~2 minutes of a config change.

## Repos and remotes

The app repo's `origin` is the local gitea (`http://localhost:3000/jrhsk8/lunchboxd.git`). The Gambdle Pages repo is at `../Documents/GitHub/Gambdle` with `origin` on GitHub.

## Local development backend

Don't use WSL for this project (owner-ruled 2026-07-23). A local Supabase stack previously ran in WSL at `~/lunchboxd-db` (Docker lives WSL-side on this machine) and may still exist there, but new work shouldn't depend on it. For verification, read-only flows can run against the production backend with the `.env.production` credentials; if a writable local backend becomes necessary, pick a Windows-side approach with the owner first.
