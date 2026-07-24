# Decisions

Lightweight log of product, tooling, and repo rulings. Newest first. Grep for the term or date rather than reading whole once this grows. Entries keep their dated headings forever so code and docs can cite them by date.

### 2026-07-24 — Text wraps rather than ellipsising; food names no longer shorten; shell widened to 1320px

Owner-ruled after a mobile audit: **if text can wrap instead of being cut, wrap it.** This reverses the same-day "shorten food" half of the ranking-row ruling below — food now wraps onto its own line on phones and only clamps at three lines (the whole 120-char field at 320px, so the clamp is a guard rail, not a routine cut). The username keeps full display priority; that part of the earlier ruling stands. Feed headlines wrap on phones too, because the ellipsis always ate the category — the link out of the feed — and reviews clamp to three lines rather than one, since the `title` tooltip holding the full text never appears on touch.

Same ruling on desktop: the shell went `max-w-[1140px]` → `max-w-[1320px]` so the activity/categories card fits more. The feed was pinned at 676px at *every* screen width, cutting a third of activity rows (worst case 134px); at 1320 it's 816px at a 1280 viewport and 856px beyond, and nothing in the live data truncates. Mobile is untouched by this — the container is viewport-limited well below the cap. Idioms and the `sm:`-gating rule: docs/app/app-shell.md § Mobile.

### 2026-07-24 — Migrated to its own apex domain, lunchboxd.live, on Cloudflare Pages

Owner bought `lunchboxd.live`; the site moved off the `gambdle.net/lunchboxd/` subfolder onto its own apex domain. Frontend host is Cloudflare Pages (owner already runs maxout.art there), deployed via Wrangler direct upload (`wrangler pages deploy dist`) to keep deploy a deliberate manual step and avoid a Git-connected build (the app repo is on the local gitea, not GitHub). `vite.config.ts` base flipped `/lunchboxd/` → `/`; the BASE_URL-derived `emailRedirectTo` now resolves to `https://lunchboxd.live/`. DNS moved off Squarespace to a Cloudflare zone (apex needs CNAME-flattening, which Squarespace doesn't do). **Backend unchanged** — still the shared `lunchboxd` schema in Gambdle's Supabase project; a dedicated project was rejected because anonymous guest accounts can't be migrated. The Site URL stays Gambdle's (shared global value), so the emailRedirectTo rule still stands; `https://lunchboxd.live/` added to the redirect allow-list. Old URL forwards via a one-file redirect stub (`deploy/gambdle-redirect/`) that carries the hash. Mechanics: docs/meta/deploy.md.

### 2026-07-23 — Auth email sends from no-reply@maxout.art via the shared Resend account, with branded templates

Users reported never receiving magic-link/confirmation emails. Three stacked causes, each proven by controlled test: no custom SMTP (built-in mailer: 2 emails/hour project-wide, team-member-only delivery), Gmail silently discarding mail from the never-seen address `lunchboxd@maxout.art`, and Gmail silently discarding Supabase's skeletal default templates even from a good sender. Owner-ruled sender choice (picked over a second Resend account or the $20/mo upgrade, both of which would allow a gambdle.net sender): the existing maxout Resend account, `"Lunchboxd" <no-reply@maxout.art>` — the free plan's one domain slot is taken by maxout.art, and only the no-reply address has the delivery history Gmail trusts. Cross-brand From address accepted. Templates are branded Lunchboxd copy, which is project-wide config — if Gambdle ever adds email auth, its users get Lunchboxd-flavored emails and the templates will need to be made neutral. Full config and gotchas: docs/meta/deploy.md.

### 2026-07-23 — Admin role with the ban hammer; bans take the whole namespace down

Owner-asked: admins (hand-granted in SQL, no UI) get a badge and can ban from a profile page. Ban semantics owner-specified: "that removes all their categories and reviews" — so `ban_profile` deletes the target's rankings AND their invented categories, cascading away everyone else's rankings inside those categories. Deliberate collateral: a spammer's junk namespace disappears whole. No unban button. First admin: jrhsk8.

### 2026-07-23 — Self-service profile tags: Peloton (blue) or Zwift (ugly on purpose), never both

Owner-asked, for the Peloton-themed Discord crowd: profiles get Discord-flair-style self-picked tags from a fixed roster. Flair is either/or (owner-ruled same day: "must be peloton or zwift but not both") — enforced by the `profiles_tags_single` check, and the picker swaps instead of stacking. Colors owner-ruled: Admin red, Peloton blue (revised from the initial brand red), Zwift a murky chartreuse because "make the zwift one an ugly color" — do not tasteful-ify it. Profile editing means exactly this tag picking (no handle rename UI). Roster changes = migration (check constraint) + `SELF_TAGS`/`TAG_STYLES` in ui.tsx. Second admin granted same day: bamba.

### 2026-07-23 — Docs structure mirrors the Maxout project

Owner-asked: the repo gets a `docs/` tree in the Maxout style — routed topic docs under `app/`, `meta/`, `writing/`, this decisions log, and a root `CLAUDE.md` router with a read-when table. Scaled to this project's size; new categories only when a doc genuinely doesn't fit.

### 2026-07-23 — No WSL for this project

Owner-ruled ("don't use wsl for this project, i don't think it's necessary"). Build, verify, and deploy from Windows directly. The old WSL local Supabase stack (`~/lunchboxd-db`) is legacy; see docs/meta/deploy.md § Local development backend.

### 2026-07-23 — Profile pages use hash routing

`#/u/<handle>` rather than path routing, because the site is a static folder under gambdle.net/lunchboxd with no SPA-fallback rewrites (deep links would 404) and hash routes can't collide with Supabase magic-link fragments. Rationale recorded in docs/app/app-shell.md; revisit only if hosting gains rewrite support.

### 2026-07-23 — Every auth email call passes emailRedirectTo

The shared Supabase project's Site URL is Gambdle's, so any emailed auth link without an explicit redirect strands the user on gambdle.net. Found live when a "Keep account" confirmation email linked to the Gambdle homepage. Rule and details: docs/app/auth.md § The email-redirect rule.

### 2026-07-23 — Hearts are Letterboxd semantics: the author's own loved-it mark

The first hearts build was a `likes` table (anyone hearts anyone's ranking). Replaced same-day with a `hearted` flag on the ranking itself: the author marks their own ranking "loved it", independent of the score; everyone sees it, only the owner flips it. Migration `20260724170000_heart_own_ranking.sql`. Don't reintroduce cross-user likes without a ruling.

### 2026-07-23 — Guest handles are owned forever; signup never fails on collision

A handle belongs to its account permanently, even a signed-out guest account nobody can recover. The profile trigger falls back to `name-2`, `name-3`, … instead of raising (a raise failed the entire auth signup and locked the handle for good), the client pre-checks availability for a friendly message, and sign-out warns anonymous users their handle is gone for keeps. Migration `20260724150000_username_collision.sql`; details in docs/app/auth.md.

### 2026-07-23 — Backend cohabits Gambdle's Supabase project in its own schema

Lunchboxd rides in the same hosted Supabase project as gambdle.net, fully isolated in a `lunchboxd` Postgres schema. Nothing touches `public` — that's Gambdle's. This is the standing hard constraint behind every migration and query; mechanics in docs/app/data-model.md and docs/meta/deploy.md.
