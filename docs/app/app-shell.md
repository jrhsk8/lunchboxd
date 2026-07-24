# App shell — pages, routing, design language

The single-page structure, how routing works, and the visual idioms every new surface should reuse. Sourced from `src/`, authoritative as of 2026-07-23.

## Pages and routing

The app is one React SPA with **hash routing** (`src/ui.tsx` `useRoute`):

- `#/` (or no hash) — home: hero, rank-a-food / sign-in panel, and the categories/activity tabs.
- `#/u/<handle>` — a profile page ([Profile.tsx](../../src/Profile.tsx)): stats tiles + full ranking history. Handles are percent-encoded in hrefs (`profileHref`); malformed encodings fall back to home.
- `#/c/<name>` — a category page (`CategoryPage` in App.tsx): name, average, everyone's rankings, and the admin tools for admins. Looked up by name through `categories`' citext unique, so the URL is case-insensitive; `categoryHref` percent-encodes. Category names link here from every feed via `CategoryLink`, plus a "Category page →" link in the expanded board panel.
- `#/t/<hashtag>` — a hashtag page (`TagPage` in App.tsx): every review containing `#hashtag`, newest first. Reviews render through `ReviewText` (ui.tsx), which linkifies `#hashtag` tokens via `tagHref`. Matching is case-insensitive and word-bounded — a DB `ilike '%#tag%'` prefilter refined by a client-side regex, so `#tag` doesn't match `#tagged` (`useTagReviews` in data.ts). Hashtags are purely a render/route convention: no schema change, reviews stay plain text.

Hash routing is a deliberate choice, not a shortcut: the site is a static build on Cloudflare Pages (`lunchboxd.live`) with no SPA-fallback rewrites configured, so path routing would 404 on deep links. Hashes also can't collide with Supabase magic-link fragments (`#access_token=…`), which supabase-js consumes and clears on load. The header/footer stay mounted across routes; only the body swaps (`Site` in App.tsx).

## Component map

- `App.tsx` — `Site` (shell + route dispatch), `RankForm` (score + optional review text), `CategoryBoard`/`CategoryDetail`, `CategoryPage`, `TagPage`, `RankingRows` (the row list shared by panel and page), `CategoryAdminTools` (admin rename / merge-into, in both the panel and the page), `ActivityFeed`, `Terms`, `WhatsNew`. Feed rows show a ranking's review as a one-line italic quote under the headline (full text in the `title` tooltip), with `#hashtags` linkified via `ReviewText`.
- `Profile.tsx` — `ProfilePage` (stats + history; own-view gets edit controls).
- `auth.tsx` — `useAuth`, `SignInCard` (guest-first), `KeepAccount`.
- `Stars.tsx` — `Stars` (fractional display), `StarInput` (half-star hit zones).
- `ui.tsx` — shared: `panel`/`kicker` class strings, `scoreTone`, `timeAgo`, `useRoute` + the `*Href` builders, `UserLink`/`CategoryLink`, `ReviewText` (hashtag linkifier), `Tag`/`profileTags`, `Heart`.
- `data.ts` — all Supabase reads/writes; components never touch the client directly except auth flows.
- `releases.ts` — the version history: a newest-first list of releases, and `version` (= `releases[0].version`), which the footer shows. Shipping a release means adding an entry at the top **and** bumping `package.json` to match; neither derives from the other. **Import it aliased** (`version as siteVersion`) — inside `Site`, `version` is `useBoard`'s refresh counter, and the unaliased import is shadowed by it, which silently puts the poll count in the footer instead of the release number. `tsc` catches this only as an unused import.

## Design language

Lifted from Maxout's v2 editorial dark skin; tokens live in `src/index.css` `@theme` (Tailwind v4).

- **Brand:** the lunchbox-with-star mark. Assets and the lockup/sizing/don'ts spec live in `public/brand/` (README.md there is authoritative). The header renders the on-dark mark inline in App.tsx; the favicon is the clay-tile version.

- **Ground:** warm near-black (`bg`), panels on `panel` with `--radius-card` and the hard drop shadow. Panels use the shared `panel` class string from ui.tsx — don't re-derive it.
- **Accent:** clay (`clay`/`clay-hover`) for kickers, links, and primary buttons; gold for stars and hearts; `good`/`bad` for score tones via `scoreTone` (≥4 good, <2.5 bad).
- **Type:** single typeface (Schibsted Grotesk). Section headers are uppercase tracking-wide "kickers" (the shared `kicker` class). Numbers are `tabular-nums`.
- **Interactive idioms:** usernames render through `UserLink` (clay hover) everywhere they appear; owner-only controls (delete, heart toggle) reveal on row hover; empty states are a panel with a bold one-liner plus a playful sub-line.
- **Username tags:** maxout's player-badge pattern — one hue drives text, dot, border, and fill of a small chip (`Tag` in ui.tsx). Roster: `admin` (red, granted), `peloton` (blue, self-picked), `zwift` (murky chartreuse, self-picked — ugly on purpose, owner-ruled), `runner` (violet, self-picked). Flair is either/or — one self-tag at most, DB-enforced (`profiles_tags_single`), and the picker swaps rather than stacks. Tags ride along wherever `UserLink` gets a `meta` prop; the flair picker lives on your own profile page.

- **Mobile:** the page is a single centered column that already reflows (stat tiles are `grid-cols-2 sm:grid-cols-4`, etc.). The header hides the rankings/categories count below `sm`. Five idioms carry the phone layout, all of them `sm:`-gated so desktop stays pixel-identical (verify that claim by screenshot-diffing 1280px before/after any of these):

  - **Rows stack, then collapse.** The ranking row and the category board row both put their content on line one and their meta (time/stars/score/heart/delete, or stars/score/caret) on line two, using `flex-wrap` + a `w-full ... sm:contents` wrapper — at `sm+` the wrapper vanishes and the children rejoin the single desktop line. Without this the board row gave each category name ~25px at 320px, i.e. one letter and an ellipsis.
  - **Feed headlines wrap on phones, truncate on desktop** (`block sm:truncate`). One ellipsised line always lost its tail, and the tail is the category — the link out of the feed.
  - **Reviews clamp to three lines on phones** (the shared `reviewLine` in ui.tsx), one ellipsised line at `sm+`. Desktop's full text lives in the `title` tooltip, which a touch device never shows, so one line there meant a dozen words and no way to see the rest.
  - **Anything user-named needs `break-words`** (`break-all` inside a flex container, where `overflow-wrap` doesn't shrink min-content): hashtags have no length cap, category names run to 60 chars and handles to 24, any of which can arrive as one unbroken token and sail off the right edge. Header columns that hold such text need `min-w-0`, or the column sizes to its max-content and drags the page with it.
  - **Owner-only hover controls must be visible without hover** (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`), or the feature is unreachable on touch.

  Within the ranking row's name line the **username gets display priority** (`shrink-0`, never truncates), and the food wraps onto its own line rather than shortening — owner-ruled 2026-07-24, reversing the earlier "shorten food". Nothing on a phone is ellipsised that could wrap instead.

- **Shell width:** `max-w-[1320px]`, not the original 1140. The feed headline ("X ranked FOOD in CATEGORY") is the widest thing on the site and the category sits at the end, so it was what got cut; at 1140 the feed was pinned to 676px at every screen width and a third of activity rows truncated. Changing this width changes how much of a headline survives on desktop — measure the truncated-row count before and after, don't eyeball it.

Player-facing copy has its own rules: [../writing/voice.md](../writing/voice.md).
