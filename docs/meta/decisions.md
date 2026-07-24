# Decisions

Lightweight log of product, tooling, and repo rulings. Newest first. Grep for the term or date rather than reading whole once this grows. Entries keep their dated headings forever so code and docs can cite them by date.

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
