# App shell — pages, routing, design language

The single-page structure, how routing works, and the visual idioms every new surface should reuse. Sourced from `src/`, authoritative as of 2026-07-23.

## Pages and routing

The app is one React SPA with **hash routing** (`src/ui.tsx` `useRoute`):

- `#/` (or no hash) — home: hero, rank-a-food / sign-in panel, and the categories/activity tabs.
- `#/u/<handle>` — a profile page ([Profile.tsx](../../src/Profile.tsx)): stats tiles + full ranking history. Handles are percent-encoded in hrefs (`profileHref`); malformed encodings fall back to home.
- `#/c/<name>` — a category page (`CategoryPage` in App.tsx): name, average, everyone's rankings, and the admin tools for admins. Looked up by name through `categories`' citext unique, so the URL is case-insensitive; `categoryHref` percent-encodes. Category names link here from every feed via `CategoryLink`, plus a "Category page →" link in the expanded board panel.
- `#/t/<hashtag>` — a hashtag page (`TagPage` in App.tsx): every review containing `#hashtag`, newest first. Reviews render through `ReviewText` (ui.tsx), which linkifies `#hashtag` tokens via `tagHref`. Matching is case-insensitive and word-bounded — a DB `ilike '%#tag%'` prefilter refined by a client-side regex, so `#tag` doesn't match `#tagged` (`useTagReviews` in data.ts). Hashtags are purely a render/route convention: no schema change, reviews stay plain text.

Hash routing is a deliberate choice, not a shortcut: the site is a static folder under `gambdle.net/lunchboxd` (GitHub Pages) with no SPA-fallback rewrites, so path routing would 404 on deep links. Hashes also can't collide with Supabase magic-link fragments (`#access_token=…`), which supabase-js consumes and clears on load. The header/footer stay mounted across routes; only the body swaps (`Site` in App.tsx).

## Component map

- `App.tsx` — `Site` (shell + route dispatch), `RankForm` (score + optional review text), `CategoryBoard`/`CategoryDetail`, `CategoryPage`, `TagPage`, `RankingRows` (the row list shared by panel and page), `CategoryAdminTools` (admin rename / merge-into, in both the panel and the page), `ActivityFeed`, `Terms`. Feed rows show a ranking's review as a one-line italic quote under the headline (full text in the `title` tooltip), with `#hashtags` linkified via `ReviewText`.
- `Profile.tsx` — `ProfilePage` (stats + history; own-view gets edit controls).
- `auth.tsx` — `useAuth`, `SignInCard` (guest-first), `KeepAccount`.
- `Stars.tsx` — `Stars` (fractional display), `StarInput` (half-star hit zones).
- `ui.tsx` — shared: `panel`/`kicker` class strings, `scoreTone`, `timeAgo`, `useRoute` + the `*Href` builders, `UserLink`/`CategoryLink`, `ReviewText` (hashtag linkifier), `Tag`/`profileTags`, `Heart`.
- `data.ts` — all Supabase reads/writes; components never touch the client directly except auth flows.

## Design language

Lifted from Maxout's v2 editorial dark skin; tokens live in `src/index.css` `@theme` (Tailwind v4).

- **Brand:** the lunchbox-with-star mark. Assets and the lockup/sizing/don'ts spec live in `public/brand/` (README.md there is authoritative). The header renders the on-dark mark inline in App.tsx; the favicon is the clay-tile version.

- **Ground:** warm near-black (`bg`), panels on `panel` with `--radius-card` and the hard drop shadow. Panels use the shared `panel` class string from ui.tsx — don't re-derive it.
- **Accent:** clay (`clay`/`clay-hover`) for kickers, links, and primary buttons; gold for stars and hearts; `good`/`bad` for score tones via `scoreTone` (≥4 good, <2.5 bad).
- **Type:** single typeface (Schibsted Grotesk). Section headers are uppercase tracking-wide "kickers" (the shared `kicker` class). Numbers are `tabular-nums`.
- **Interactive idioms:** usernames render through `UserLink` (clay hover) everywhere they appear; owner-only controls (delete, heart toggle) reveal on row hover; empty states are a panel with a bold one-liner plus a playful sub-line.
- **Username tags:** maxout's player-badge pattern — one hue drives text, dot, border, and fill of a small chip (`Tag` in ui.tsx). Roster: `admin` (red, granted), `peloton` (blue, self-picked), `zwift` (murky chartreuse, self-picked — ugly on purpose, owner-ruled), `runner` (violet, self-picked). Flair is either/or — one self-tag at most, DB-enforced (`profiles_tags_single`), and the picker swaps rather than stacks. Tags ride along wherever `UserLink` gets a `meta` prop; the flair picker lives on your own profile page.

- **Mobile:** the page is a single centered column that already reflows (stat tiles are `grid-cols-2 sm:grid-cols-4`, etc.). The one non-obvious idiom is the **ranking row**: on phones it stacks (food/user + review on line one, then time/stars/score/heart/delete on line two) so the food name isn't crushed to a few characters, while on `sm+` it collapses back to a single line via `sm:contents` on the meta wrapper — so desktop stays pixel-identical. Owner-only controls that reveal on hover (the delete ✕) must also be visible without hover on touch (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`), or the feature is unreachable on mobile. The header hides the rankings/categories count below `sm`.

Player-facing copy has its own rules: [../writing/voice.md](../writing/voice.md).
