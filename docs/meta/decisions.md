# Decisions

Lightweight log of product, tooling, and repo rulings. Newest first. Grep for the term or date rather than reading whole once this grows. Entries keep their dated headings forever so code and docs can cite them by date.

### 2026-07-25 — The Supporter badge is a column, not a tag

Owner-asked: "add a Supporter tag and give it to people that have donated to me."

**It is `profiles.is_supporter`, not a fourth entry in the `tags` roster.** The roster looked like the obvious home — it is the badge mechanism, `Tag` already renders it, `profileTags` already orders it. But `tags` is inside the column-scoped update grant (`grant update (username, tags)`), which is what makes flair self-service; adding `supporter` there would have let all 96 accounts award themselves one from the browser console. Granted badges live in their own columns for the same reason `is_admin` does, and the column is free of `profiles_tags_single`, so a supporter keeps the Peloton/Zwift/Runner tag they were already wearing. `profileTags` also tightened on the way past: it filters the `tags` array against `SELF_TAGS` rather than against every chip in `TAG_STYLES`, so the client cannot render a granted badge out of user-writable data even if the check constraint were dropped.

Teal (`--color-supporter`), because the conventional gold is already the heart's hue and a warm chip beside a handle reads as a love mark. Granted by hand in SQL with no UI and no RPC — the same deliberate absence as `is_admin` — so awarding the next one is one `update` statement. First five: scytop, Exa, dougmcfawn, Chef, UgoffIsHungry.

### 2026-07-25 — You can log the same food again, ten a day; the one-per-food index is gone

Reverses the one-row-per-person-per-food-per-category rule from earlier the same day. It came in as a user bug report — someone had several Zyns over an evening, and the site refused every one after the first _and_ showed them `duplicate key value violates unique constraint "rankings_one_per_food_idx"` while doing it. Owner-ruled: **"they wanted to log multiple zyns in one day, they should be able to."**

The index was created to stop one account logging "Pizza" fifty times at 5.0 to move the board — but the other half of that same batch had already closed that hole. `category_stats.avg_score` averages each person's scores first and then averages those, so a category counts a person **once** however many rankings they file: ten identical 5.0s move it exactly as far as one. The index was, by the time it landed, guarding a door the view had locked, and the cost was falling entirely on people logging their actual day.

Kept, as a `before insert` trigger, is the part the index was still genuinely buying — protection from mashing rather than from stuffing. **The stutter**: identical food and score, same person and category, inside a minute (four such groups, six rows, were real accidental double-submits in the live data). **The cap**: ten of the same food per person per category per rolling 24 hours — owner-ruled number, rolling rather than calendar because the server keeps UTC and the people using the site do not. Both raise P0001 carrying the sentence the user reads.

Consequence to know before reversing this back: **the unique index cannot simply be recreated** once duplicates exist, and from now on they will.

**The raw Postgres text was its own bug, and the class of it is fixed.** Every write in data.ts ended `: error.message`, which was fine only while every failure anyone had thought of was mapped — then a new constraint landed and a user was shown SQL. `writeError` (text.ts, tested) now stands between every write and the person: known SQLSTATEs get a written sentence, our own P0001 raises pass through, and anything else gets a plain "That didn't go through" while the raw text goes to the console. Timeline, since it explains the report: the index and the v0.5.0 deploy landed within minutes of each other, so tabs opened before that were running v0.4.0 JavaScript — which had no mapping — against the new index. Reloading fixed it for them. **A constraint-tightening migration reaches every already-open tab instantly, while the code that explains it does not** — deploy the frontend first, or expect exactly this.

### 2026-07-25 — The top four, and who may delete a category

Owner-asked: "add a top 4 like letterboxd. allow deleting of a category entirely."

**The top four is a slot on the ranking, not a favourites table.** `rankings.top_rank` is 1–4 or null, bounded by a check and made a _four_ by a partial unique index on `(user_id, top_rank)`. Same reasoning as `hearted` (2026-07-23): what gets favourited **is** a ranking — food is not a first-class unit here (#34) — and the existing cascade on a deleted ranking takes its pin with it. Pinning takes the lowest free slot rather than one past the highest, because unpinning leaves a hole and max+1 would ask for slot 5. **No reordering UI**: the cards render in slot order and that is the whole interaction, pin and unpin. The pin control is on your own profile only, not on the board, the feed or the category page — a fourth small control on every row is a row that doesn't fit a phone, and the four are curated in the one place they're displayed.

**Deleting a category: admins always, the inventor only while nobody else has ranked there.** Who may delete wasn't specified in the ask, and the two readings differ a lot, so: the admin half is unambiguous (it joins rename and merge in the same tools, same SECURITY DEFINER pattern, no delete grant on `categories`). The inventor's carve-out is the "I typo'd a category into existence" case and is deliberately narrow — a category is a communal namespace, so once somebody else has ranked in it, deleting it destroys _their_ rankings, and having invented it first must not confer that. **Open for a ruling**: whether the inventor should get it at all, and whether it should extend past the first outside ranker. Deletion cascades and there is no undo, so a rule that widens is easier to ship later than one that turns out to have been too wide.

Also fixed on the way past: `npm run types` had been dead on this box. `gen-types.js` spawned `npx.cmd` through `execFileSync`, which Node has refused since 20.12 (CVE-2024-27980) — EINVAL on Node 24, so the generated types couldn't be refreshed after a migration at all. It goes through a shell now.

### 2026-07-25 — Issue-board batch: identity, leaderboard integrity, and four reversals

Worked the whole open issue board in one pass. The rulings worth citing later:

**Handles are case-insensitive, and six accounts were merged to get there.** `profiles.username` became `citext`, matching `categories.name`, which fixes `#/u/Jack` silently rendering "No one by that handle" for `jack` and closes case-variant impersonation. Six real collision pairs blocked the unique index (`Chef`/`CHEF`, `Will`/`will`, `Exa`/`exa` — an admin — `TopOfTheLine`/`topoftheline`, `Zach`/`zach`, `Native`/`native`). Owner-ruled: **merge them, keeping the properly capitalised handle.** The surviving _account_ is the one with the activity, not the one with the nicer capitalisation — four of six pairs had their rankings on the lowercase side, so keeping the prettier profile row would have orphaned the person actually using the site. The dormant account's rankings and invented categories move across and its `auth.users` row is deleted (safe: `auth.users` holds only Lunchboxd users — Gambdle, which shares the project, doesn't use Supabase Auth).

**Handles get a charset, strictly, and eight people were renamed.** `^[A-Za-z0-9_-]+$` plus a reserved list (`admin`, `lunchboxd`, `moderator`, …). Owner-ruled **strict over grandfathering**, so eight existing handles with spaces or punctuation were rewritten (`Hall & Oats` → `Hall_Oats`, `Joel ♊` → `Joel-2`, and so on — the full mapping is in the migration). The threat is confusable and invisible characters next to an Admin badge, and a `NOT VALID` constraint would have left that surface open on exactly the rows that already exercise it.

**The leaderboard is one-person-one-vote with a prior.** `avg_score` now averages each person's scores within a category first, then averages those — so logging ten foods in a category no longer moves it ten times as far as logging one. A unique index on `(user_id, category_id, lower(btrim(food)))` stops the same food being logged twice; six accidental double-submits were removed to create it. The board sorts on a new `weighted_score`, a Bayesian prior of three notional voters at the site mean, so a thirty-second-old category with a single 5.0 sits near the mean until real people agree with it.

**Rankings are editable — reversing the delete-and-re-log ruling.** data-model.md recorded the review as "set at insert only; the update grant stays `hearted`-only". That cost the timestamp, the feed position and the heart to fix a typo in a 2000-character field. The grant widens to `(hearted, review, score, food)`; `user_id` and `category_id` stay ungranted. Owner-ruled **silent**: no `edited_at`, no "edited" marker. Feed order keys off `created_at`, which an edit doesn't touch, so editing can't re-float a ranking.

**Terms is a route, not a modal.** `#/terms`. The one page someone might cite ("We do not collect your data") couldn't be linked or bookmarked, and browser back did nothing. This also retired the modal's missing focus trap and Escape handling rather than fixing them.

**The typeface is self-hosted.** Google Fonts sent every visitor's IP, UA and referring page to Google before first paint, which is precisely what the Terms say isn't happening. The woff2s live in `public/fonts`; the CSP in `public/_headers` has no Google origin in it and shouldn't gain one.

**No CI, because there is no runner.** Prettier, ESLint and Vitest are pinned devDependencies with an `npm run check` that chains them, but the gitea instance has Actions enabled and zero registered runners, so a workflow file would show a permanently pending job on every push. Register `act_runner` and the workflow becomes worth adding.

Deliberately **not** done, and still open: food as a first-class unit (#34) and the search/follows/reports features that depend on it (#35, #36, #37), a captcha on anonymous sign-in (#28), board search (#13), list pagination (the other half of #11), a materialised `category_stats` (#10), soft-delete for `ban_profile` (#33), and reviews as first-class content (#39). #38 (prompting categories you haven't ranked) was closed as won't-do, though #14's datalist removes the "opens on + New category…" default as a side effect.

### 2026-07-24 — Version history is a footer dialog, not a changelog page

Owner-asked for "versioning and version history on the site", then ruled the scope: **website updates, no changelog page.** So the site carries a semver it shows in the footer (`v0.4.0`) and the history opens as a dialog from that button, mirroring the existing Terms-of-service idiom — no `#/changelog` route, nothing to deep-link. Source of truth is `src/releases.ts`, newest first; `package.json`'s version is bumped by hand to match. Notes are user-facing copy under voice.md and cover only what someone using the site would notice — docs, deploy plumbing and refactors stay out. Retroactive 0.1.0–0.4.0 entries were reconstructed from git history. Component and the import-aliasing trap: docs/app/app-shell.md.

### 2026-07-24 — The gambdle.net redirect stub is Gambdle's file; it must carry the query string

Found from a user report ("I lost my handle, the email stuff didn't work"): the stub that forwards `gambdle.net/lunchboxd/` to lunchboxd.live forwarded `location.hash` only. Supabase auth links use supabase-js v2's default **PKCE** flow, so the token comes back as `?code=` in the **query string** — and those links land on the old URL every time GoTrue falls back to the Site URL, which is permanently Gambdle's. The stub dropped the code and delivered people to lunchboxd.live signed out. Fixed to forward `location.search + location.hash` (Gambdle `ba50c75`).

Owner-ruled at the same time: **the stub belongs to Gambdle, and this repo deploys nothing to Gambdle.** The `deploy/gambdle-redirect/` copy and the staging recipe are deleted; the two projects are now unrelated apart from the shared Supabase project. Anyone changing the redirect does it in the Gambdle repo. Mechanics: docs/meta/deploy.md § Old URL redirect.

### 2026-07-24 — The sign-in card names the returning-user path; auth buttons say what they do

Owner-asked for "a sign in option if you already have an account". The magic-link field already existed but sat under the divider "or keep your account", which reads as _persistence for a newcomer_, not _sign in for a returning user_ — the affordance was there and invisible. Divider is now "already have an account?" and the button "Send sign-in link" (was "Email link"). Owner-ruled on the unknown-email case: **keep creating an account** (an address with no account still gets a link and lands on a generated `eater-*` handle to rename) and **"the buttons should be very clear what they do and function like any other site"** — which overrides voice.md's "buttons are short verbs" where the short verb would be ambiguous about the mechanic. A helper line states the mechanic outright: no password, unseen address starts a new account. Guest-first ordering is unchanged; "Start ranking" is still the primary action.

### 2026-07-24 — Text wraps rather than ellipsising; food names no longer shorten; shell widened to 1320px

Owner-ruled after a mobile audit: **if text can wrap instead of being cut, wrap it.** This reverses the same-day "shorten food" half of the ranking-row ruling below — food now wraps onto its own line on phones and only clamps at three lines (the whole 120-char field at 320px, so the clamp is a guard rail, not a routine cut). The username keeps full display priority; that part of the earlier ruling stands. Feed headlines wrap on phones too, because the ellipsis always ate the category — the link out of the feed — and reviews clamp to three lines rather than one, since the `title` tooltip holding the full text never appears on touch.

Same ruling on desktop: the shell went `max-w-[1140px]` → `max-w-[1320px]` so the activity/categories card fits more. The feed was pinned at 676px at _every_ screen width, cutting a third of activity rows (worst case 134px); at 1320 it's 816px at a 1280 viewport and 856px beyond, and nothing in the live data truncates. Mobile is untouched by this — the container is viewport-limited well below the cap. Idioms and the `sm:`-gating rule: docs/app/app-shell.md § Mobile.

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
