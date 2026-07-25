# Data model

The Postgres schema, the RLS matrix, and how the client keeps its views fresh. Sourced from `supabase/migrations/` and `src/data.ts`, authoritative as of 2026-07-23.

## The one hard constraint

**Everything lives in the `lunchboxd` Postgres schema — nothing ever touches `public`.** In production the Supabase project is shared with gambdle.net; the schema is the isolation boundary. The client sets `db: { schema: 'lunchboxd' }` (`src/supabase.ts`), and the schema must be in PostgREST's exposed schemas (config.toml `api.schemas` locally, the Dashboard "Exposed schemas" setting hosted) or every query fails with PGRST106.

## Tables

- **`profiles`** — `id` (FK to `auth.users`, cascade), `username` (**citext** unique, 2–24 chars, `^[A-Za-z0-9_-]+$`, and not one of the reserved names), `created_at`, `is_admin`, `is_supporter`, `banned_at`, `tags` (text[], constrained to the roster `peloton`/`zwift`/`runner`). Created by the `handle_new_user` trigger; see [auth.md](auth.md). The update grant is **column-scoped to `username, tags`** — that scoping is the entire defense against users setting their own `is_admin` or clearing `banned_at`; never widen it back to whole-row. The update policy also requires `banned_at is null`, so a banned account can't cycle handles or re-add the flair the ban cleared. A `before update of username` trigger (`profiles_handle_rules`) adds the two rules RLS can't express per-column: a guest can't rename until it has an email, and nobody can claim a `guest-*` name. See [auth.md](auth.md).
- **`categories`** — `id`, `name` (citext unique, 1–60 chars, so "pizza" and "Pizza" are one category), `created_by` (nullable FK), `created_at`. One global namespace, first ranker invents it.
- **`rankings`** — `id`, `category_id` (cascade), `user_id` (cascade), `food` (1–120 chars), `score` (numeric(2,1), half-star steps 0.5–5 enforced by check), `hearted` (boolean), `review` (nullable text, 1–2000 chars), `top_rank` (nullable smallint 1–4), `created_at`. **The same food can be logged as many times as you eat it**, up to ten a day — see § Repeat rankings below; the old one-row-per-person-per-food unique index is gone. Rankings are **editable**: the update grant covers `(hearted, review, score, food, top_rank)`. That reverses an earlier "set at insert only" position — see decisions.md 2026-07-25. Edits are silent (no `edited_at`, no marker) and don't touch `created_at`, so an edit can't re-float a ranking up the feed.
- **`category_stats`** (view, security_invoker) — one row per category: ranking_count, ranker_count, avg_score, last_ranked_at, weighted_score, created_by. The global leaderboard. `created_by` rides along so the client can tell whether to offer the inventor's delete button without a query per category; it is appended last because `create or replace view` may only add columns at the end. **`avg_score` is one-person-one-vote**: each person's scores within the category are averaged first, then those averages are averaged. **`weighted_score` is what the board sorts by** — a Bayesian prior of three notional voters at the site-wide mean, so a new category with a single 5.0 doesn't outrank fifty rankings averaging 4.8. Read `avg_score` when displaying a category's score, `weighted_score` only for ordering.
- **`profile_stats`** (view, security_invoker) — one row per profile: ranking_count, category_count, hearted_count, avg_score. The profile page's tiles read from here rather than deriving them from the capped ranking list, which made a heavy user's "lifetime average" the average of their most recent 500.

## The Eaters view

`eaters` (view, security_invoker, `20260725040000_eaters.sql`) — one row per person **who has ever ranked**, carrying the handle, the badges, the three chosen card slots and the accent, every column of `profile_card_stats`, and `last_ranked_at`.

It exists so the Eaters tab can sort and page **in the database**. The tab shows 24 of seventy-odd across four orderings; doing that client-side would mean fetching every eater's whole card to draw a third of them, and the cap would be a slice rather than a limit.

Two things it deliberately does rather than leaving to the client. `where ranking_count > 0` is the whole membership rule, and it takes banned accounts out for free — `ban_profile` deletes the target's rankings, so the count is zero and the row is gone; there is no `banned_at` filter to forget. And the columns are **named rather than `select *`**: a card can show any of the fourteen stats, so a subset would render a dash for whoever chose the missing one — and a view built on a star freezes its column list at creation anyway, which makes the star a claim about staying in step that isn't true.

`last_ranked_at` lives here and not in `profile_card_stats` because no card stat wants it: "eating since" is the profile's `created_at`, which is when somebody signed up, not when they last showed up.

The client maps a row into `CardStats` through **`cardStatsFrom`** (data.ts), shared with `useCardStats` — one mapping, so a card can't say different things about the same person depending on which page drew it.

## Notifications

`notifications` (`20260725030000_notifications.sql`) — `user_id` (the **recipient**), `actor_id`, `ranking_id`, `kind` (checked, `'like'` today), `created_at`, `read_at`. Unique on `(user_id, actor_id, ranking_id, kind)`, so like/unlike/like again is one row rather than three.

**This is the only private table here.** Everything else on the site is world-readable; `anon` has no grant at all on this one, and the select policy is `user_id = auth.uid()`. There is **no insert or delete grant for anybody** — rows arrive from the trigger and leave with the like they describe, so a notification can be neither forged nor quietly deleted by the person it embarrasses. The update grant is **column-scoped to `read_at`**, which is what stops a recipient rewriting who a notification came from; RLS can't narrow to a column, so the grant has to.

Two triggers on `likes` keep it in step: `likes_notify_author` writes the row (SECURITY DEFINER — the liker has no insert grant, and shouldn't, because the row belongs to the person being told), `likes_unnotify_author` removes it. **Retention is therefore not a policy but a consequence**: a like disappears when it's taken back, when the ranking is deleted (cascade), and when the ranking is edited (§ Hearts / the clear-likes trigger), and its notification goes with it every time. Nothing accumulates and there is no age rule.

Per-item `read_at` rather than a single `seen_at` on the profile row is a cost the **surface** chose: a page that lists items invites marking one read (app-shell.md § Pages and routing, #46). Opening the page marks everything read (`markNotificationsRead`), but the unread dots stay drawn for that visit — clearing them the instant they render would mean a page that never shows you what was new.

Guests receive notifications. They can't give a like (§ Likes / #42), but they can be liked, and reading your own news needs no email.

## Repeat rankings

The same person may log the same food in the same category **as many times as they eat it, up to ten in a rolling 24 hours** (`20260725013000_allow_repeat_rankings.sql`). This reversed `rankings_one_per_food_idx` the same day it shipped — owner-ruled off a user report: someone had several Zyns over an evening and the site refused every one after the first.

The reason it was safe to drop is worth keeping straight, because the index's own comment argues the opposite. It was there to stop one account logging "Pizza" fifty times at 5.0 to move the board. **The view already prevents that**: `avg_score` averages each person's scores first and then averages those, so a category counts a person once however many rankings they file — ten identical 5.0s move it exactly as far as one does. By the time the index landed, in the same batch, it was guarding a door the view had locked.

What the index _was_ still buying is protection from mashing, so a `before insert` trigger (`check_repeat_rankings`) keeps that in two parts:

- **the stutter** — identical food _and_ score, same person, same category, inside a minute. Four such groups (six rows) were in the live data when the index was created, all accidental double-submits;
- **the cap** — ten of the same food per person per category per rolling 24 hours. Rolling rather than calendar: the server keeps UTC and the people using the site do not, so a calendar day would reset mid-afternoon for them.

Both are raised as **P0001 with the sentence the user should read**, which `writeError` passes through untouched — that pass-through is why the trigger's messages are written as copy and belong under [voice.md](../writing/voice.md).

## The top four

`top_rank` is the Letterboxd top four: 1–4 when a ranking sits in its author's four, null otherwise. A slot on the ranking rather than a favourites table, for the same reason `hearted` is a flag on the ranking — the thing being favourited **is** a ranking (food is not a first-class unit here), and the cascade that removes a deleted ranking removes its pin for free.

Two guards hold the rule, both in `20260725010000_top_four.sql`: the check bounds a slot to 1–4, and the partial unique index `rankings_one_per_top_slot_idx (user_id, top_rank) where top_rank is not null` allows one ranking per slot per person. Pinning picks the **lowest free** slot (`nextTopSlot` in text.ts, tested) rather than one past the highest — unpinning leaves a hole, and counting from the top would ask for slot 5 and hit the check. Two tabs racing for a slot lose one write to a 23505 rather than both landing.

The pin control is deliberately only on **your own profile** (`pin` prop on `RankingRow`): the four are a thing you curate about yourself in the one place they're shown, and a fourth small control on every row of the board and the feed is a row that doesn't fit a phone.

## Hearts

`hearted` is a flag on the ranking itself: the **author's** "loved it" mark, independent of the score, Letterboxd-style. Everyone sees it; only the owner can flip it (column-level `grant update (hearted)` + an owner-only update policy). An earlier design (`likes` table, anyone hearts anyone) was built and then replaced the same day — see decisions.md 2026-07-23. Don't reintroduce cross-user likes without a ruling.

## Supporters

`is_supporter` (`20260725012000_supporter_tag.sql`) is the badge for people who have donated. Like `is_admin` it is **granted by hand in SQL** — no UI, no RPC, no self-service — and for a specific reason: the update grant on `profiles` covers `tags`, so anything living in that array is self-issuable by construction, and a chip that means "this person paid" must not be. A column is also outside `profiles_tags_single`, so the badge doesn't cost a supporter their Peloton/Zwift/Runner flair.

Granting more is one statement: `update lunchboxd.profiles set is_supporter = true where username in (...)` — `username` is citext, so casing doesn't matter. `ban_profile` clears `tags` but deliberately leaves `is_supporter` alone (the donation happened); banned profiles render no chips at all, so it makes no visible difference either way.

## RLS matrix

| Table         | select                             | insert                               | update                                                  | delete                      |
| ------------- | ---------------------------------- | ------------------------------------ | ------------------------------------------------------- | --------------------------- |
| profiles      | everyone                           | trigger only                         | own row, not banned, `username`+`tags` columns only     | —                           |
| categories    | everyone                           | own (`created_by = uid`), not banned | —                                                       | ban / delete functions only |
| rankings      | everyone                           | own, not banned                      | own, `(hearted, review, score, food, top_rank)` columns | own, or ban function        |
| notifications | **own row only** (no `anon` grant) | trigger only (no grant)              | own row, `read_at` column only                          | trigger only (no grant)     |

Grants are explicit per table (nothing is granted by default in a custom schema); RLS narrows on top.

## Admins and bans

`is_admin` is granted by hand in SQL (there is deliberately no UI or API for it). Admins get a badge everywhere their name shows and a "Ban profile" button on other, non-admin profiles. The ban is the SECURITY DEFINER function **`ban_profile(target)`** (`supabase/migrations/20260724190000_admins_bans_tags.sql`), exposed as an RPC: it checks the caller is an admin, refuses self-bans and admin targets, then deletes the target's rankings, deletes every category they invented (**cascading away other people's rankings in those categories** — owner-ruled: a spammer's junk namespace goes down with them), and stamps `banned_at`. Banned accounts keep their session and profile but fail every insert policy. There is no unban UI; clearing `banned_at` in SQL un-bans but restores nothing.

Admins also get category surgery (`supabase/migrations/20260724220000_reviews_and_category_admin.sql`), exposed in the expanded category panel: **`rename_category(cat, new_name)`** renames in place (a collision with an existing name is a plain unique violation), and **`merge_categories(source, target)`** moves every ranking from `source` into `target` and deletes `source` — averages recompute, no undo. Both are SECURITY DEFINER with in-body admin checks, same pattern as `ban_profile`; there are still no update/delete grants on `categories`.

**`delete_category(cat)`** (`20260725011000_delete_category.sql`) is the third of them and the only one not admin-only: an admin may always delete, and **the person who invented a category may delete it only while nobody else has ranked in it**. That second rule is the "I typo'd a category into existence" case, and it stops there on purpose — a category is a communal namespace, so once other people have ranked in it, deleting it destroys their rankings, and inventing it first must not carry that power. Deleting cascades the rankings away; there is no undo and no soft-delete. Its exceptions are written as readable sentences rather than the terse lowercase of the other two, because the buttons are gated client-side and anything raised has therefore already surfaced through an unexpected path and gets shown to whoever hit it. `categoryToolsFor` in App.tsx is the client-side half of the same rule.

## Client data flow (`src/data.ts`)

- **`useBoard`** owns the shared board: category_stats + the 30-newest activity feed, fetched together. A single `version` counter is the refresh trigger; bumping it refetches everything keyed on it (including expanded categories and profile pages, which take `version` as a prop).
- **Realtime is an enhancement, not the source of truth**: a `postgres_changes` subscription on `rankings` bumps `version`, and so do tab focus/visibility (debounced to one refetch, since both fire on the same tab switch). There is deliberately **no interval** — `category_stats` aggregates every ranking in the table, and a 15-second poll in every open tab recomputed it site-wide four times a minute forever. Anything that must stay fresh should key off `version` rather than subscribing itself.
- **Every hook returns an `error`.** They used to destructure `data` and drop `error`, so an outage rendered as "No categories yet" — the site reporting emptiness as fact. Emptiness and failure are now different states and must stay that way; a failed board deliberately never sets `loaded`.
- **`rankFood`** does find-or-create on the category by name (citext eq is case-insensitive), with a second lookup on unique-violation to absorb the invent race.
- **`useProfile`** resets to its loading state only when the handle changes; version bumps refetch in place so the profile page never flashes during the poll. It fetches the **top four as its own query** rather than filtering the history list: that list is capped at 500 and ordered by recency, so a four picked from an older ranking simply wouldn't be in it — the same trap `profile_stats` exists to avoid.
- **`RANKING_FIELDS`** is the one column list every ranking read uses. It was five hand-copied strings, and a new column meant remembering all five.

## Indexes

`rankings (category_id, created_at desc)` and `rankings (created_at desc)` from init, plus: `rankings (user_id, created_at desc)` and `categories (created_by)` — Postgres does not index foreign keys automatically, and both the profile page and `ban_profile`'s deletes were sequential scans without them — a GIN trigram index on `rankings.review`, which is what makes the hashtag page's leading-wildcard `ilike` indexable, and the partial unique `rankings_one_per_top_slot_idx` above. `rankings_one_per_food_idx` was dropped — and note it **cannot simply be recreated**, since duplicates are now legal and will exist.

## Applying schema changes

New migrations go in `supabase/migrations/` and are applied to the hosted project with `node supabase/apply.js migrations/<file>.sql` (Management API; there is no local stack). **Then run `npm run types`** to regenerate `src/database.types.ts` — the generated types are what stops a renamed column compiling clean and failing at runtime. Take a backup first with `npm run backup` if the migration touches data. Full mechanics: [../meta/deploy.md](../meta/deploy.md).
