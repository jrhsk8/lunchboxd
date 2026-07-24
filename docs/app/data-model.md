# Data model

The Postgres schema, the RLS matrix, and how the client keeps its views fresh. Sourced from `supabase/migrations/` and `src/data.ts`, authoritative as of 2026-07-23.

## The one hard constraint

**Everything lives in the `lunchboxd` Postgres schema — nothing ever touches `public`.** In production the Supabase project is shared with gambdle.net; the schema is the isolation boundary. The client sets `db: { schema: 'lunchboxd' }` (`src/supabase.ts`), and the schema must be in PostgREST's exposed schemas (config.toml `api.schemas` locally, the Dashboard "Exposed schemas" setting hosted) or every query fails with PGRST106.

## Tables

- **`profiles`** — `id` (FK to `auth.users`, cascade), `username` (unique, 2–24 chars), `created_at`, `is_admin`, `banned_at`, `tags` (text[], constrained to the roster `peloton`/`zwift`). Created by the `handle_new_user` trigger; see [auth.md](auth.md). The update grant is **column-scoped to `username, tags`** — that scoping is the entire defense against users setting their own `is_admin` or clearing `banned_at`; never widen it back to whole-row.
- **`categories`** — `id`, `name` (citext unique, 1–60 chars, so "pizza" and "Pizza" are one category), `created_by` (nullable FK), `created_at`. One global namespace, first ranker invents it.
- **`rankings`** — `id`, `category_id` (cascade), `user_id` (cascade), `food` (1–120 chars), `score` (numeric(2,1), half-star steps 0.5–5 enforced by check), `hearted` (boolean), `review` (nullable text, 1–2000 chars — set at insert only; the update grant stays `hearted`-only, so editing a review means delete and re-log), `created_at`.
- **`category_stats`** (view, security_invoker) — one row per category: ranking_count, ranker_count, avg_score, last_ranked_at. The global leaderboard.

## Hearts

`hearted` is a flag on the ranking itself: the **author's** "loved it" mark, independent of the score, Letterboxd-style. Everyone sees it; only the owner can flip it (column-level `grant update (hearted)` + an owner-only update policy). An earlier design (`likes` table, anyone hearts anyone) was built and then replaced the same day — see decisions.md 2026-07-23. Don't reintroduce cross-user likes without a ruling.

## RLS matrix

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | everyone | trigger only | own row, `username`+`tags` columns only | — |
| categories | everyone | own (`created_by = uid`), not banned | — | ban function only |
| rankings | everyone | own, not banned | own, `hearted` column only | own, or ban function |

Grants are explicit per table (nothing is granted by default in a custom schema); RLS narrows on top.

## Admins and bans

`is_admin` is granted by hand in SQL (there is deliberately no UI or API for it). Admins get a badge everywhere their name shows and a "Ban profile" button on other, non-admin profiles. The ban is the SECURITY DEFINER function **`ban_profile(target)`** (`supabase/migrations/20260724190000_admins_bans_tags.sql`), exposed as an RPC: it checks the caller is an admin, refuses self-bans and admin targets, then deletes the target's rankings, deletes every category they invented (**cascading away other people's rankings in those categories** — owner-ruled: a spammer's junk namespace goes down with them), and stamps `banned_at`. Banned accounts keep their session and profile but fail every insert policy. There is no unban UI; clearing `banned_at` in SQL un-bans but restores nothing.

Admins also get category surgery (`supabase/migrations/20260724220000_reviews_and_category_admin.sql`), exposed in the expanded category panel: **`rename_category(cat, new_name)`** renames in place (a collision with an existing name is a plain unique violation), and **`merge_categories(source, target)`** moves every ranking from `source` into `target` and deletes `source` — averages recompute, no undo. Both are SECURITY DEFINER with in-body admin checks, same pattern as `ban_profile`; there are still no update/delete grants on `categories`.

## Client data flow (`src/data.ts`)

- **`useBoard`** owns the shared board: category_stats + the 30-newest activity feed, fetched together. A single `version` counter is the refresh trigger; bumping it refetches everything keyed on it (including expanded categories and profile pages, which take `version` as a prop).
- **Realtime is an enhancement, not the source of truth**: a `postgres_changes` subscription on `rankings` bumps `version`, but so do a 15-second poll and tab-focus/visibility events. Anything that must stay fresh should key off `version` rather than subscribing itself.
- **`rankFood`** does find-or-create on the category by name (citext eq is case-insensitive), with a second lookup on unique-violation to absorb the invent race.
- **`useProfile`** resets to its loading state only when the handle changes; version bumps refetch in place so the profile page never flashes during the poll.

## Applying schema changes

New migrations go in `supabase/migrations/` and are applied to the hosted project via the Supabase Management API — see [../meta/deploy.md](../meta/deploy.md).
