# Data model

The Postgres schema, the RLS matrix, and how the client keeps its views fresh. Sourced from `supabase/migrations/` and `src/data.ts`, authoritative as of 2026-07-23.

## The one hard constraint

**Everything lives in the `lunchboxd` Postgres schema — nothing ever touches `public`.** In production the Supabase project is shared with gambdle.net; the schema is the isolation boundary. The client sets `db: { schema: 'lunchboxd' }` (`src/supabase.ts`), and the schema must be in PostgREST's exposed schemas (config.toml `api.schemas` locally, the Dashboard "Exposed schemas" setting hosted) or every query fails with PGRST106.

## Tables

- **`profiles`** — `id` (FK to `auth.users`, cascade), `username` (unique, 2–24 chars), `created_at`. Created by the `handle_new_user` trigger; see [auth.md](auth.md).
- **`categories`** — `id`, `name` (citext unique, 1–60 chars, so "pizza" and "Pizza" are one category), `created_by` (nullable FK), `created_at`. One global namespace, first ranker invents it.
- **`rankings`** — `id`, `category_id` (cascade), `user_id` (cascade), `food` (1–120 chars), `score` (numeric(2,1), half-star steps 0.5–5 enforced by check), `hearted` (boolean), `created_at`.
- **`category_stats`** (view, security_invoker) — one row per category: ranking_count, ranker_count, avg_score, last_ranked_at. The global leaderboard.

## Hearts

`hearted` is a flag on the ranking itself: the **author's** "loved it" mark, independent of the score, Letterboxd-style. Everyone sees it; only the owner can flip it (column-level `grant update (hearted)` + an owner-only update policy). An earlier design (`likes` table, anyone hearts anyone) was built and then replaced the same day — see decisions.md 2026-07-23. Don't reintroduce cross-user likes without a ruling.

## RLS matrix

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | everyone | trigger only | own row | — |
| categories | everyone | own (`created_by = uid`) | — | — |
| rankings | everyone | own | own, `hearted` column only | own |

Grants are explicit per table (nothing is granted by default in a custom schema); RLS narrows on top.

## Client data flow (`src/data.ts`)

- **`useBoard`** owns the shared board: category_stats + the 30-newest activity feed, fetched together. A single `version` counter is the refresh trigger; bumping it refetches everything keyed on it (including expanded categories and profile pages, which take `version` as a prop).
- **Realtime is an enhancement, not the source of truth**: a `postgres_changes` subscription on `rankings` bumps `version`, but so do a 15-second poll and tab-focus/visibility events. Anything that must stay fresh should key off `version` rather than subscribing itself.
- **`rankFood`** does find-or-create on the category by name (citext eq is case-insensitive), with a second lookup on unique-violation to absorb the invent race.
- **`useProfile`** resets to its loading state only when the handle changes; version bumps refetch in place so the profile page never flashes during the poll.

## Applying schema changes

New migrations go in `supabase/migrations/` and are applied to the hosted project via the Supabase Management API — see [../meta/deploy.md](../meta/deploy.md).
