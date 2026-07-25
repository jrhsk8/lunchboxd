# Data model

The Postgres schema, the RLS matrix, and how the client keeps its views fresh. Sourced from `supabase/migrations/` and `src/data.ts`, authoritative as of 2026-07-23.

## The one hard constraint

**Everything lives in the `lunchboxd` Postgres schema — nothing ever touches `public`.** In production the Supabase project is shared with gambdle.net; the schema is the isolation boundary. The client sets `db: { schema: 'lunchboxd' }` (`src/supabase.ts`), and the schema must be in PostgREST's exposed schemas (config.toml `api.schemas` locally, the Dashboard "Exposed schemas" setting hosted) or every query fails with PGRST106.

## Tables

- **`profiles`** — `id` (FK to `auth.users`, cascade), `username` (**citext** unique, 2–24 chars, `^[A-Za-z0-9_-]+$`, and not one of the reserved names), `created_at`, `is_admin`, `banned_at`, `tags` (text[], constrained to the roster `peloton`/`zwift`/`runner`). Created by the `handle_new_user` trigger; see [auth.md](auth.md). The update grant is **column-scoped to `username, tags`** — that scoping is the entire defense against users setting their own `is_admin` or clearing `banned_at`; never widen it back to whole-row. The update policy also requires `banned_at is null`, so a banned account can't cycle handles or re-add the flair the ban cleared.
- **`categories`** — `id`, `name` (citext unique, 1–60 chars, so "pizza" and "Pizza" are one category), `created_by` (nullable FK), `created_at`. One global namespace, first ranker invents it.
- **`rankings`** — `id`, `category_id` (cascade), `user_id` (cascade), `food` (1–120 chars), `score` (numeric(2,1), half-star steps 0.5–5 enforced by check), `hearted` (boolean), `review` (nullable text, 1–2000 chars), `created_at`. **One row per person per food per category**, case-insensitively and trimmed (`rankings_one_per_food_idx`) — without it one account could log "Pizza" fifty times and move the global average. Rankings are **editable**: the update grant covers `(hearted, review, score, food)`. That reverses an earlier "set at insert only" position — see decisions.md 2026-07-25. Edits are silent (no `edited_at`, no marker) and don't touch `created_at`, so an edit can't re-float a ranking up the feed.
- **`category_stats`** (view, security_invoker) — one row per category: ranking_count, ranker_count, avg_score, last_ranked_at, weighted_score. The global leaderboard. **`avg_score` is one-person-one-vote**: each person's scores within the category are averaged first, then those averages are averaged. **`weighted_score` is what the board sorts by** — a Bayesian prior of three notional voters at the site-wide mean, so a new category with a single 5.0 doesn't outrank fifty rankings averaging 4.8. Read `avg_score` when displaying a category's score, `weighted_score` only for ordering.
- **`profile_stats`** (view, security_invoker) — one row per profile: ranking_count, category_count, hearted_count, avg_score. The profile page's tiles read from here rather than deriving them from the capped ranking list, which made a heavy user's "lifetime average" the average of their most recent 500.

## Hearts

`hearted` is a flag on the ranking itself: the **author's** "loved it" mark, independent of the score, Letterboxd-style. Everyone sees it; only the owner can flip it (column-level `grant update (hearted)` + an owner-only update policy). An earlier design (`likes` table, anyone hearts anyone) was built and then replaced the same day — see decisions.md 2026-07-23. Don't reintroduce cross-user likes without a ruling.

## RLS matrix

| Table      | select   | insert                               | update                                              | delete               |
| ---------- | -------- | ------------------------------------ | --------------------------------------------------- | -------------------- |
| profiles   | everyone | trigger only                         | own row, not banned, `username`+`tags` columns only | —                    |
| categories | everyone | own (`created_by = uid`), not banned | —                                                   | ban function only    |
| rankings   | everyone | own, not banned                      | own, `(hearted, review, score, food)` columns       | own, or ban function |

Grants are explicit per table (nothing is granted by default in a custom schema); RLS narrows on top.

## Admins and bans

`is_admin` is granted by hand in SQL (there is deliberately no UI or API for it). Admins get a badge everywhere their name shows and a "Ban profile" button on other, non-admin profiles. The ban is the SECURITY DEFINER function **`ban_profile(target)`** (`supabase/migrations/20260724190000_admins_bans_tags.sql`), exposed as an RPC: it checks the caller is an admin, refuses self-bans and admin targets, then deletes the target's rankings, deletes every category they invented (**cascading away other people's rankings in those categories** — owner-ruled: a spammer's junk namespace goes down with them), and stamps `banned_at`. Banned accounts keep their session and profile but fail every insert policy. There is no unban UI; clearing `banned_at` in SQL un-bans but restores nothing.

Admins also get category surgery (`supabase/migrations/20260724220000_reviews_and_category_admin.sql`), exposed in the expanded category panel: **`rename_category(cat, new_name)`** renames in place (a collision with an existing name is a plain unique violation), and **`merge_categories(source, target)`** moves every ranking from `source` into `target` and deletes `source` — averages recompute, no undo. Both are SECURITY DEFINER with in-body admin checks, same pattern as `ban_profile`; there are still no update/delete grants on `categories`.

## Client data flow (`src/data.ts`)

- **`useBoard`** owns the shared board: category_stats + the 30-newest activity feed, fetched together. A single `version` counter is the refresh trigger; bumping it refetches everything keyed on it (including expanded categories and profile pages, which take `version` as a prop).
- **Realtime is an enhancement, not the source of truth**: a `postgres_changes` subscription on `rankings` bumps `version`, and so do tab focus/visibility (debounced to one refetch, since both fire on the same tab switch). There is deliberately **no interval** — `category_stats` aggregates every ranking in the table, and a 15-second poll in every open tab recomputed it site-wide four times a minute forever. Anything that must stay fresh should key off `version` rather than subscribing itself.
- **Every hook returns an `error`.** They used to destructure `data` and drop `error`, so an outage rendered as "No categories yet" — the site reporting emptiness as fact. Emptiness and failure are now different states and must stay that way; a failed board deliberately never sets `loaded`.
- **`rankFood`** does find-or-create on the category by name (citext eq is case-insensitive), with a second lookup on unique-violation to absorb the invent race.
- **`useProfile`** resets to its loading state only when the handle changes; version bumps refetch in place so the profile page never flashes during the poll.

## Indexes

`rankings (category_id, created_at desc)` and `rankings (created_at desc)` from init, plus: `rankings (user_id, created_at desc)` and `categories (created_by)` — Postgres does not index foreign keys automatically, and both the profile page and `ban_profile`'s deletes were sequential scans without them — a GIN trigram index on `rankings.review`, which is what makes the hashtag page's leading-wildcard `ilike` indexable, and the unique `rankings_one_per_food_idx` above.

## Applying schema changes

New migrations go in `supabase/migrations/` and are applied to the hosted project with `node supabase/apply.js migrations/<file>.sql` (Management API; there is no local stack). **Then run `npm run types`** to regenerate `src/database.types.ts` — the generated types are what stops a renamed column compiling clean and failing at runtime. Take a backup first with `npm run backup` if the migration touches data. Full mechanics: [../meta/deploy.md](../meta/deploy.md).
