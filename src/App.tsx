/**
 * The shell and every page that isn't a profile: the header, the board and its
 * three tabs, the category and hashtag pages, notifications, and the terms.
 *
 * One file rather than a directory of pages, because routing is a hash and a
 * switch (`useRoute` in `src/ui.tsx`) rather than a router — there is nothing
 * for a page module to register with, and a page here is a function that gets
 * rendered when the hash says so. What does live elsewhere is anything with a
 * second home: the row, the marks and the chips in `src/ui.tsx`, the profile in
 * `src/Profile.tsx`, every query in `src/data.ts`. See app-shell.md § Component
 * map before adding a page.
 */

import { useEffect, useState } from 'react';

import { KeepAccount, SignInCard, useAuth } from './auth';
import { CallingCard } from './CallingCard';
import {
  cardStatsFrom,
  deleteCategory,
  EATERS_PAGE,
  markNotificationsRead,
  mergeCategories,
  rankFood,
  renameCategory,
  useBoard,
  useCategoryRankings,
  useCategoryStat,
  useEaters,
  useHashtagReviews,
  useMyLikes,
  useNotifications,
  useUnreadCount,
  type CategoryStat,
  type EaterSort,
  type Ranking,
} from './data';
import { categoryToolsFor, viewerKind } from './permissions';
import { ProfilePage } from './Profile';
import { StarInput, Stars } from './Stars';
import { supabase } from './supabase';
import { cleanHashtag, matchCategories, plural, routeSignpost } from './text';
import {
  btnPrimary,
  categoryHref,
  CategoryLink,
  input,
  inputSmall,
  groupLabel,
  kicker,
  LikesProvider,
  EmptyState,
  LoadError,
  label,
  Loading,
  NotificationBell,
  PageHeader,
  panel,
  ProfileLink,
  profileHref,
  profileTags,
  RankingRow,
  ReviewText,
  scoreTone,
  SortToggle,
  Tag,
  timeAgo,
  useRoute,
} from './ui';

/** The board's three views, in tab order — also the arrow-key order. */
const TABS = ['categories', 'activity', 'eaters'] as const;
type BoardTab = (typeof TABS)[number];

const byName = (a: CategoryStat, b: CategoryStat) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export default function App() {
  if (!supabase) return <SetupNotice />;
  return <Site />;
}

function SetupNotice() {
  return (
    <div className="mx-auto max-w-lg p-10">
      <p className={kicker}>Lunchboxd</p>
      <h1 className="mt-1 text-2xl font-bold">Backend not configured</h1>
      <p className="text-sm leading-relaxed text-dim">
        Copy <code className="text-ink">.env.example</code> to{' '}
        <code className="text-ink">.env.local</code> and fill in{' '}
        <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
        <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> from your Supabase project, then
        apply <code className="text-ink">supabase/migrations</code>.
      </p>
    </div>
  );
}

function Site() {
  const { session, username, isAdmin, refreshProfile } = useAuth();
  const { stats, activity, loaded, error, version, refresh } = useBoard();
  const route = useRoute();
  // One query for every row on the page, keyed to the board's refresh counter
  // so a like lights up its own row the moment the refetch lands.
  const myLikes = useMyLikes(session?.user.id ?? null, version);
  const viewer = viewerKind(session);
  const unread = useUnreadCount(session?.user.id ?? null, version);
  const [tab, setTab] = useState<BoardTab>('categories');
  const [openId, setOpenId] = useState<string | null>(null);

  const { key: routeKey, title } = routeSignpost(route);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  // Every route shared the one static title, so the tab and the browser history
  // said "Lunchboxd: Food, Ranked" wherever you were. Link previews are a
  // separate problem the hash router can't solve — a crawler never sees the
  // fragment — so the static og:* tags in index.html carry those.
  useEffect(() => {
    document.title = title;
  }, [title]);

  const totalRankings = stats.reduce((n, c) => n + c.ranking_count, 0);

  return (
    // 1320, not 1140: the feed headline ("X ranked FOOD in CATEGORY") is the
    // widest thing on the site and the category — the link out — sits at the
    // end, so it was what got ellipsised. The extra 180px clears it.
    <LikesProvider liked={myLikes} viewer={viewer}>
      <div className="mx-auto max-w-[1320px] p-[clamp(16px,4vw,40px)]">
        <header className="mb-8 flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-edge bg-topbar px-4 py-2.5">
          {/* Brand lockup per public/brand/README.md: 24px on-dark mark, 17px/800
            lowercase wordmark with the clay "d", gap 0.4x the icon width. */}
          <a href="#/" className="flex items-center gap-2.5" title="Back to the board">
            <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
              <rect
                x="4"
                y="19"
                width="40"
                height="23"
                rx="4"
                fill="none"
                stroke="#fcfcfc"
                strokeWidth="3.5"
              />
              <path
                d="M16 19 v-3.5 a3.5 3.5 0 0 1 3.5 -3.5 h9 a3.5 3.5 0 0 1 3.5 3.5 v3.5"
                fill="none"
                stroke="#fcfcfc"
                strokeWidth="3.5"
              />
              <path
                d="M24 24 l2 4 4.4 .6 -3.2 3.1 .8 4.3 -4 -2.1 -4 2.1 .8 -4.3 -3.2 -3.1 4.4 -.6 z"
                fill="#fca044"
              />
            </svg>
            <span className="text-[17px] font-extrabold tracking-[-0.02em]">
              lunchbox<span className="text-clay">d</span>
            </span>
          </a>
          <span className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-faint tabular-nums sm:inline">
              {totalRankings} rankings · {stats.length} categories
            </span>
            {session && (
              <>
                <NotificationBell unread={unread} />
                {username ? (
                  <a
                    href={profileHref(username)}
                    title="Your profile"
                    className="flex items-center gap-1.5 rounded-lg border border-edge bg-raised px-2.5 py-1 text-xs font-bold transition-colors hover:border-edge-hover hover:text-clay"
                  >
                    {username}
                    {isAdmin && <Tag kind="admin" size={9} />}
                  </a>
                ) : (
                  <span className="rounded-lg border border-edge bg-raised px-2.5 py-1 text-xs font-bold">
                    …
                  </span>
                )}
                {viewer === 'guest' && <KeepAccount />}
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-xs whitespace-nowrap text-faint hover:text-ink"
                  onClick={() => {
                    if (
                      viewer === 'guest' &&
                      !window.confirm(
                        `Guest accounts can't be recovered: sign out and this account is gone for good. Your rankings stay on the board under ${username ? `"${username}"` : 'your handle'}, but you'll never add to them or pick a handle. Use "Add email" first to keep it. Sign out anyway?`,
                      )
                    ) {
                      return;
                    }
                    supabase!.auth.signOut();
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </span>
        </header>
        {route.page === 'terms' ? (
          <Terms />
        ) : route.page === 'notifications' ? (
          <NotificationsPage userId={session?.user.id ?? null} version={version} onRead={refresh} />
        ) : route.page === 'hashtag' ? (
          <HashtagPage hashtag={route.hashtag} version={version} />
        ) : route.page === 'category' ? (
          <CategoryPage
            name={route.name}
            stats={stats}
            version={version}
            userId={session?.user.id ?? null}
            viewerIsAdmin={isAdmin}
            onChanged={refresh}
          />
        ) : route.page === 'profile' ? (
          <ProfilePage
            username={route.username}
            version={version}
            userId={session?.user.id ?? null}
            viewerIsAdmin={isAdmin}
            viewerIsGuest={viewer === 'guest'}
            onChanged={refresh}
            onRenamed={() => {
              refresh();
              refreshProfile();
            }}
          />
        ) : (
          <>
            <div className="mb-6">
              <p className={`${kicker} mb-1.5`}>Food, ranked, together</p>
              <h1 className="m-0 text-[28px] font-bold">Every bite goes on the record</h1>
              <p className="mt-2 mb-0 max-w-xl text-sm leading-relaxed text-dim">
                Categories belong to everyone. Invent one, score what you eat out of five, and the
                global average shifts with every ranking anyone logs.
              </p>
            </div>

            <div className="grid items-start gap-6 md:grid-cols-[360px_minmax(0,1fr)]">
              <section className={`${panel} p-5`} aria-label={session ? 'rank a food' : 'sign in'}>
                <p className={`${kicker} mb-4`}>{session ? 'Rank a food' : 'Join the table'}</p>
                {session ? (
                  <RankForm userId={session.user.id} stats={stats} onLogged={refresh} />
                ) : (
                  <SignInCard />
                )}
              </section>

              <section className="flex min-w-0 flex-col gap-3">
                {/* A real tablist: these were two plain buttons whose selected
                  state was carried by background colour alone, so a screen
                  reader announced two unrelated buttons and said nothing about
                  which view was showing. Roving tabindex + arrow keys come with
                  the pattern. */}
                <div
                  role="tablist"
                  aria-label="board view"
                  className="flex gap-1 self-start rounded-(--radius-card) border-2 border-edge bg-raised p-1"
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                    e.preventDefault();
                    // Wraps both ways. With two tabs either direction reached
                    // the other one; with three, stepping has to know which
                    // way it's going.
                    const step = e.key === 'ArrowRight' ? 1 : TABS.length - 1;
                    const next = TABS[(TABS.indexOf(tab) + step) % TABS.length];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }}
                >
                  {TABS.map((t) => (
                    <button
                      key={t}
                      id={`tab-${t}`}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      aria-controls={`panel-${t}`}
                      tabIndex={tab === t ? 0 : -1}
                      className={`cursor-pointer rounded-[7px] border-0 px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                        tab === t
                          ? 'bg-clay/15 text-ink'
                          : 'bg-transparent text-dim hover:bg-edge hover:text-ink'
                      }`}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
                  {tab === 'eaters' ? (
                    <EatersTab version={version} />
                  ) : tab === 'categories' ? (
                    <CategoryBoard
                      stats={stats}
                      loaded={loaded}
                      error={error}
                      openId={openId}
                      setOpenId={setOpenId}
                      version={version}
                      userId={session?.user.id ?? null}
                      viewerIsAdmin={isAdmin}
                      onChanged={refresh}
                    />
                  ) : (
                    <ActivityFeed
                      activity={activity}
                      loaded={loaded}
                      error={error}
                      userId={session?.user.id ?? null}
                      onChanged={refresh}
                    />
                  )}
                </div>
              </section>
            </div>
          </>
        )}
        {/* Wraps on phones: three items at 320px otherwise push the footer wider
          than the viewport. */}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-2">
          <span className="text-xs text-faint">
            Lunchboxd — like Letterboxd, but you can eat the subject matter.
          </span>
          <a href="#/terms" className="text-xs text-faint underline hover:text-dim">
            Terms of service
          </a>
          {/* Off-site, so it says where it goes and opens in its own tab —
              nobody should lose a half-written ranking to a tip jar. */}
          <a
            href="https://ko-fi.com/jrhsk8"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-faint underline hover:text-dim"
          >
            Buy me a coffee
          </a>
        </footer>
      </div>
    </LikesProvider>
  );
}

const CATEGORY_SORTS = [
  { key: 'rank', label: 'Top rated' },
  { key: 'az', label: 'A–Z' },
] as const;
type CategorySort = (typeof CATEGORY_SORTS)[number]['key'];

const EATER_SORTS: { key: EaterSort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'likes', label: 'Likes' },
  { key: 'az', label: 'A–Z' },
];

/**
 * The Eaters tab: everyone who has ever ranked, as their calling card.
 *
 * The card's second home (#44) — the profile shows you your own, and this is
 * the only place the three stats somebody chose about themselves are visible
 * to anybody else. A tab rather than a route, owner-ruled: it lives with the
 * board rather than beside it, and the cost is that it can't be linked to.
 *
 * Cards, not rows: a compact row would scale further, but it would leave the
 * card with one home and make the studio a private toy.
 */
function EatersTab({ version }: { version: number }) {
  const [sort, setSort] = useState<EaterSort>('recent');
  const [shown, setShown] = useState(EATERS_PAGE);
  const { items, total, loaded, error } = useEaters(sort, shown, version);
  const left = total - items.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Four settings where the board next door has two, so the row wraps
          rather than scrolling sideways. */}
      <SortToggle
        label="sort eaters"
        options={EATER_SORTS}
        value={sort}
        wrap
        onChange={(key) => {
          setSort(key);
          // A new ordering is a new list: keeping the old depth would quietly
          // show three pages of it.
          setShown(EATERS_PAGE);
        }}
      />

      {error ? (
        <LoadError />
      ) : !loaded ? null : items.length === 0 ? (
        <EmptyState line="Nobody has eaten yet" sub="The first bite is yours." />
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {items.map((e) => (
              <li key={e.user_id} className="min-w-0">
                <CallingCard
                  handle={e.username}
                  href={profileHref(e.username)}
                  tags={profileTags(e)}
                  stats={cardStatsFrom(e)}
                  slots={[e.card_slot_1, e.card_slot_2, e.card_slot_3]}
                  accent={e.card_accent}
                  isSupporter={e.is_supporter}
                  isAdmin={e.is_admin}
                />
              </li>
            ))}
          </ul>
          {left > 0 && (
            <button
              type="button"
              className={`${panel} cursor-pointer px-6 py-3 text-center text-sm font-semibold text-clay hover:text-clay-hover`}
              onClick={() => setShown((n) => n + EATERS_PAGE)}
            >
              Show more ({left} to go)
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Everything that has happened to you: today, likes on your rankings.
 *
 * A page rather than a header dropdown or a line on your profile (#46). The
 * cost is a table with per-item read state; what it buys is a place — a URL
 * that can be linked, bookmarked and returned to, and room for follows (#36)
 * and reports (#37) later without moving anyone's furniture.
 *
 * Opening the page is what marks them read, but the unread marks stay drawn
 * for this visit: clearing them the instant they're rendered would mean
 * arriving at a page that never shows you what was new.
 */
function NotificationsPage({
  userId,
  version,
  onRead,
}: {
  userId: string | null;
  version: number;
  onRead: () => void;
}) {
  const { items, loaded, error } = useNotifications(userId, version);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!userId || !loaded || marked) return;
    if (!items.some((n) => n.read_at === null)) return;
    setMarked(true);
    markNotificationsRead().then(onRead);
  }, [userId, loaded, items, marked, onRead]);

  return (
    <div>
      <PageHeader
        className="mb-5"
        kind="Notifications"
        title="What people did with your rankings"
      />

      {!userId ? (
        <EmptyState
          line="Nothing to tell you yet"
          sub="Sign in and this is where the news lands."
        />
      ) : error ? (
        <LoadError />
      ) : !loaded ? null : items.length === 0 ? (
        <EmptyState
          line="No news"
          sub={<>When somebody likes one of your rankings, you&rsquo;ll hear about it here.</>}
        />
      ) : (
        <div className={`${panel} px-5 py-2`}>
          <ul className="m-0 flex list-none flex-col p-0">
            {items.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-2.5 border-b border-edge py-3 text-sm last:border-b-0"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.read_at === null ? 'bg-clay' : 'bg-transparent'
                  }`}
                  aria-label={n.read_at === null ? 'new' : undefined}
                  role={n.read_at === null ? 'img' : undefined}
                />
                {/* break-words throughout: handles run to 24 characters and
                    foods to 120, either of which can arrive as one token. */}
                <span className="min-w-0 flex-1 break-words">
                  <ProfileLink username={n.actor?.username ?? null} meta={n.actor} />{' '}
                  <span className="text-dim">liked your</span>{' '}
                  <span className="font-semibold">{n.rankings?.food ?? 'ranking'}</span>
                  {n.rankings?.categories && (
                    <>
                      <span className="text-dim"> in </span>
                      <CategoryLink name={n.rankings.categories.name} />
                    </>
                  )}
                </span>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {timeAgo(n.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The privacy position, at its own URL.
 *
 * This was a modal held in component state, so the one page on the site
 * somebody might want to cite or link — "We do not collect your data" — could
 * not be linked, bookmarked or shared, and browser back did nothing. Making it
 * a route also retired the modal's missing focus trap and Escape handling
 * rather than fixing them.
 */
function Terms() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader kind="Terms of service" title="The deal" />
      <div className={`${panel} flex flex-col gap-3 p-6 text-sm leading-relaxed text-dim`}>
        <p className="m-0">
          <span className="font-bold text-ink">We do not collect your data.</span> No analytics, no
          tracking, no ads, no cookies beyond the session that keeps you signed in, and nothing is
          ever sold or shared with anyone. The typeface is served from this site rather than a font
          CDN, so loading the page tells nobody but us that you were here.
        </p>
        <p className="m-0">
          The only things stored are what you post to make the site work: your handle, the
          categories you invent, the foods you rank, and the hearts you give. If you sign in by
          email, the address is used solely to send you the sign-in link.
        </p>
        <p className="m-0">
          Everything you post is public — your handle, rankings, and hearts are visible to everyone.
          You can edit or delete your own rankings at any time.
        </p>
        <p className="m-0">
          Scores are a matter of taste. If the crowd says gas station sushi is a 4.5, the crowd has
          spoken.
        </p>
      </div>
    </div>
  );
}

/**
 * The category field: one input that both joins an existing category and
 * invents a new one, with the matching categories offered underneath as you
 * type.
 *
 * The suggestions are drawn here rather than by a native `<datalist>`, which is
 * what this used to be. Two reasons, one of them a bug: on Android Chrome the
 * native popup left a ghost of its own text behind when it closed, because the
 * list is composited by the browser and outside anything React can repaint. The
 * other is that a datalist only matches from the start of a name and shows
 * nothing else about a category, so "sushi" never found "Gas Station Sushi" and
 * nothing said which category everybody was already using — the two things that
 * decide whether somebody joins a category or invents a near-duplicate.
 *
 * The ranking rule is `matchCategories` in text.ts, where it is tested; this
 * owns only the control and its keyboard.
 */
function CategoryField({
  stats,
  value,
  onChange,
  known,
}: {
  stats: CategoryStat[];
  value: string;
  onChange: (name: string) => void;
  known: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = matchCategories(value, stats);
  // Nothing to offer once the typed name is the only match: the list would be
  // one row repeating the field back.
  const only =
    suggestions.length === 1 && suggestions[0].name.toLowerCase() === value.trim().toLowerCase();
  const show = open && suggestions.length > 0 && !only;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActive(0);
  }

  return (
    <label className={label}>
      Category
      {/* relative, so the list hangs off the field rather than pushing the rest
          of the form down every time somebody types a letter. */}
      <span className="relative flex flex-col">
        <input
          className={input}
          placeholder="Pizza, Gas Station Sushi, Soup-Adjacent…"
          maxLength={60}
          value={value}
          role="combobox"
          aria-expanded={show}
          aria-controls="category-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={show ? `category-suggestion-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // A blur that lands on a suggestion would close the list before the
          // tap registers, so the close waits a beat for the click.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((i) => (i + step + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(suggestions[active].name);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {show && (
          <ul
            id="category-suggestions"
            role="listbox"
            aria-label="matching categories"
            className={`${panel} absolute top-full right-0 left-0 z-20 m-0 mt-1 max-h-56 list-none overflow-y-auto p-1`}
          >
            {suggestions.map((c, i) => (
              <li key={c.id} role="none">
                <button
                  type="button"
                  id={`category-suggestion-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md border-0 px-2.5 py-2 text-left font-sans text-sm transition-colors ${
                    i === active ? 'bg-raised text-ink' : 'bg-transparent text-dim hover:bg-raised'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.name)}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold normal-case">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-normal tracking-normal text-faint normal-case tabular-nums">
                    {c.ranking_count} {plural(c.ranking_count, 'ranking', 'rankings')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
      <span className="text-[11px] font-normal tracking-normal normal-case text-faint">
        {value.trim() === ''
          ? 'Pick one everyone uses, or invent one.'
          : known
            ? 'Joining a category that already exists.'
            : `Inventing "${value.trim()}" for everybody.`}
      </span>
    </label>
  );
}

function RankForm({
  userId,
  stats,
  onLogged,
}: {
  userId: string;
  stats: CategoryStat[];
  onLogged: () => void;
}) {
  const [category, setCategory] = useState('');
  const [food, setFood] = useState('');
  const [review, setReview] = useState('');
  const [score, setScore] = useState(0);
  const [loved, setLoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canLog = !busy && score > 0 && food.trim() !== '' && category.trim() !== '';
  // Whether this name already exists decides the hint under the field, not what
  // gets sent: rankFood find-or-creates by name either way, and citext makes
  // the match case-insensitive.
  const known = stats.some((c) => c.name.toLowerCase() === category.trim().toLowerCase());

  async function submit() {
    if (!canLog) return;
    setBusy(true);
    setError(null);
    const result = await rankFood({
      userId,
      categoryName: category,
      food,
      score,
      hearted: loved,
      review,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFood('');
    setReview('');
    setScore(0);
    setLoved(false);
    onLogged();
  }

  return (
    <div className="flex flex-col gap-4">
      <CategoryField stats={stats} value={category} onChange={setCategory} known={known} />

      <label className={label}>
        What did you eat?
        <input
          className={input}
          placeholder="Costco slice, leftover pad thai…"
          maxLength={120}
          value={food}
          onChange={(e) => setFood(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </label>

      <label className={label}>
        Review (optional)
        <textarea
          className={`${input} resize-none`}
          placeholder="Cold by the time I got home, but still a #classic."
          rows={2}
          maxLength={2000}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={groupLabel}>Score</span>
        {/* Wraps rather than squeezing: below ~360px the stars and the button
            don't share a line, and "Loved it" was breaking mid-phrase. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StarInput value={score} onChange={setScore} />
          <button
            type="button"
            aria-pressed={loved}
            title="The Letterboxd heart: loved it, whatever the score"
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              loved
                ? 'border-gold/50 bg-gold/10 text-gold'
                : 'border-edge bg-transparent text-faint hover:border-edge-hover hover:text-gold'
            }`}
            onClick={() => setLoved(!loved)}
          >
            <span className="text-sm">{loved ? '♥' : '♡'}</span>
            Loved it
          </button>
        </div>
      </div>

      <button type="button" className={btnPrimary} disabled={!canLog} onClick={submit}>
        {busy ? 'Logging…' : 'Log it'}
      </button>

      {error && (
        <p className="m-0 rounded-lg border-l-4 border-bad bg-bad/10 px-3 py-2 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function CategoryBoard({
  stats,
  loaded,
  error,
  openId,
  setOpenId,
  version,
  userId,
  viewerIsAdmin,
  onChanged,
}: {
  stats: CategoryStat[];
  loaded: boolean;
  error: string | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
}) {
  const [sort, setSort] = useState<CategorySort>('rank');

  if (error) return <LoadError />;

  if (!loaded) return <Loading />;

  if (stats.length === 0) {
    return (
      <EmptyState
        line="No categories yet"
        sub={
          <>
            Rank the first food and invent one for everybody. "Handheld Breakfast" is a category.
            "Things Served in a Bread Bowl" is a category. Go nuts.
          </>
        }
      />
    );
  }

  const ordered = sort === 'az' ? [...stats].sort(byName) : stats;

  return (
    <>
      <div className="mb-1">
        <SortToggle
          label="sort categories"
          options={CATEGORY_SORTS}
          value={sort}
          onChange={setSort}
        />
      </div>
      {ordered.map((c, i) => {
        const avg = c.avg_score === null ? null : Number(c.avg_score);
        const open = openId === c.id;
        return (
          <article key={c.id} className={`${panel} overflow-hidden`}>
            {/* Phones stack the row (rank + name, then stars/score/caret) — one
                line can't hold both and the name loses, cropping to a letter.
                `sm:contents` collapses it back to the desktop single line. */}
            <button
              type="button"
              className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 border-0 bg-transparent px-5 py-4 text-left font-sans text-ink transition-colors hover:bg-raised sm:flex-nowrap"
              onClick={() => setOpenId(open ? null : c.id)}
              aria-expanded={open}
            >
              <span className="w-7 shrink-0 text-sm font-bold text-faint tabular-nums">
                {sort === 'rank' ? (avg === null ? '—' : `#${i + 1}`) : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{c.name}</span>
                <span className="mt-0.5 block text-xs text-faint">
                  {c.ranking_count} {plural(c.ranking_count, 'ranking', 'rankings')} ·{' '}
                  {c.ranker_count} {plural(c.ranker_count, 'person', 'people')}
                </span>
              </span>
              <span className="flex w-full items-center gap-3 sm:contents">
                {avg !== null && (
                  <span className="flex items-center gap-3">
                    <Stars value={avg} />
                    <span
                      className={`w-12 text-right text-xl font-bold tabular-nums ${scoreTone(avg)}`}
                    >
                      {avg.toFixed(2)}
                    </span>
                  </span>
                )}
                <span className="ml-auto text-[10px] text-faint sm:ml-0" aria-hidden>
                  {open ? '▲' : '▼'}
                </span>
              </span>
            </button>
            {open && (
              <CategoryDetail
                category={c}
                stats={stats}
                version={version}
                userId={userId}
                viewerIsAdmin={viewerIsAdmin}
                onChanged={onChanged}
                onMerged={(targetId) => setOpenId(targetId)}
                onDeleted={() => setOpenId(null)}
              />
            )}
          </article>
        );
      })}
    </>
  );
}

/**
 * Who gets tools on a category, and which set.
 *
 * Admins get the surgery kit (rename, merge, delete) they already had. The
 * person who invented a category gets delete alone, and only while nobody else
 * has ranked in it — a category is a communal namespace, so inventing one must
 * not carry the power to take everyone else's rankings down with it. Both are
 * checked again in `delete_category`; this only decides what to draw.
 */
/** Delete a category and everything ranked in it. Loud, because it's the loudest button here. */
function DeleteCategoryButton({
  category,
  onDeleted,
}: {
  category: CategoryStat;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = category.ranking_count;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="cursor-pointer rounded-lg border border-bad/50 bg-bad/10 px-2.5 py-1 text-xs font-bold text-bad transition-colors hover:bg-bad/20 disabled:cursor-default disabled:opacity-40"
        onClick={async () => {
          if (
            !window.confirm(
              n === 0
                ? `Delete "${category.name}"? Nothing has been ranked in it. It's gone for good.`
                : `Delete "${category.name}" entirely? All ${n} ${plural(n, 'ranking', 'rankings')} in it ${plural(n, 'goes', 'go')} too, from everyone who logged one, and the averages recompute without them. There is no undo.`,
            )
          ) {
            return;
          }
          setBusy(true);
          setError(null);
          const result = await deleteCategory(category.id);
          setBusy(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          onDeleted();
        }}
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}

/**
 * Category tools inside the expanded panel and on the category page: admin
 * rename / merge-into / delete, or — for whoever invented an untouched category
 * — delete on its own.
 */
function CategoryTools({
  category,
  stats,
  userId,
  viewerIsAdmin,
  onChanged,
  onRenamed,
  onMerged,
  onDeleted,
}: {
  category: CategoryStat;
  stats: CategoryStat[];
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
  onRenamed?: (newName: string) => void;
  onMerged: (targetId: string) => void;
  onDeleted: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const btnSmall =
    'cursor-pointer rounded-lg border border-edge bg-raised px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-edge-hover hover:bg-raised-hover disabled:cursor-default disabled:opacity-40';

  async function saveRename() {
    const next = name.trim();
    if (busy || !next) return;
    if (next === category.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await renameCategory(category.id, next);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRenaming(false);
    onRenamed?.(next);
    onChanged();
  }

  async function merge() {
    const t = stats.find((s) => s.id === target);
    if (busy || !t) return;
    if (
      !window.confirm(
        `Fold "${category.name}" into "${t.name}"? Every ranking moves over, "${category.name}" disappears, and the averages recompute. There is no undo.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await mergeCategories(category.id, t.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onMerged(t.id);
    onChanged();
  }

  const role = categoryToolsFor(category, { userId, isAdmin: viewerIsAdmin, isGuest: false });
  if (role === null) return null;

  const deleted = () => {
    onDeleted();
    onChanged();
  };

  if (role === 'inventor') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        <span className={groupLabel}>You invented this</span>
        <DeleteCategoryButton category={category} onDeleted={deleted} />
        <span className="text-xs text-faint">
          Only until somebody else ranks here — then it belongs to everyone.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
      <span className={groupLabel}>Admin</span>
      {renaming ? (
        <>
          <input
            className={inputSmall}
            maxLength={60}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <button type="button" className={btnSmall} disabled={busy} onClick={saveRename}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint hover:text-ink"
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className={btnSmall}
          onClick={() => {
            setName(category.name);
            setError(null);
            setRenaming(true);
          }}
        >
          Rename
        </button>
      )}
      <select className={inputSmall} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Merge into…</option>
        {stats
          .filter((s) => s.id !== category.id)
          .sort(byName)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
      <button type="button" className={btnSmall} disabled={busy || !target} onClick={merge}>
        Merge
      </button>
      <DeleteCategoryButton category={category} onDeleted={deleted} />
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}

function CategoryDetail({
  category,
  stats,
  version,
  userId,
  viewerIsAdmin,
  onChanged,
  onMerged,
  onDeleted,
}: {
  category: CategoryStat;
  stats: CategoryStat[];
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
  onMerged: (targetId: string) => void;
  onDeleted: () => void;
}) {
  const { rankings, error } = useCategoryRankings(category.id, version);

  if (error)
    return (
      <div className="border-t-2 border-edge px-5 py-4">
        <LoadError />
      </div>
    );

  if (rankings === null) return <Loading className="border-t-2 border-edge px-5" pad="py-4" />;

  const mine = userId ? rankings.filter((r) => r.user_id === userId) : [];
  const myAvg = mine.length ? mine.reduce((s, r) => s + Number(r.score), 0) / mine.length : null;

  return (
    <div className="border-t-2 border-edge bg-field/40 px-5 py-4">
      <p className="mt-0 mb-3 flex items-baseline justify-between gap-3 text-xs">
        {myAvg !== null ? (
          <span className="text-dim">
            Your average here:{' '}
            <span className={`font-bold tabular-nums ${scoreTone(myAvg)}`}>{myAvg.toFixed(2)}</span>{' '}
            across {mine.length} {plural(mine.length, 'ranking', 'rankings')}
          </span>
        ) : (
          <span />
        )}
        <a
          href={categoryHref(category.name)}
          className="shrink-0 font-semibold text-faint hover:text-clay"
        >
          Category page →
        </a>
      </p>
      <RankingRows rankings={rankings} userId={userId} onChanged={onChanged} />
      <CategoryTools
        category={category}
        stats={stats}
        userId={userId}
        viewerIsAdmin={viewerIsAdmin}
        onChanged={onChanged}
        onMerged={onMerged}
        onDeleted={onDeleted}
      />
    </div>
  );
}

/** The ranking-row list shared by the expanded board panel and the category page. */
function RankingRows({
  rankings,
  userId,
  onChanged,
  categoryName,
}: {
  rankings: Ranking[];
  userId: string | null;
  onChanged: () => void;
  categoryName?: string;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rankings.map((r) => (
        <RankingRow
          key={r.id}
          ranking={r}
          userId={userId}
          onChanged={onChanged}
          controls="owner"
          categoryName={categoryName}
          className="group flex flex-col gap-1 rounded-lg px-2 py-1.5 hover:bg-raised sm:flex-row sm:items-center sm:gap-3"
          headline={
            /* Username gets full display (never truncates). On phones the food
               wraps onto its own line rather than shortening — three lines is
               the whole 120-char field at 320px, so the clamp is a guard rail,
               not a routine cut. Desktop keeps the single truncated line. */
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap">
              <span className="shrink-0 font-medium">
                <ProfileLink username={r.profiles?.username ?? null} meta={r.profiles} />
                {userId === r.user_id && ' (you)'}
              </span>
              <span className="line-clamp-3 min-w-0 text-xs break-words text-faint sm:block sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap">
                {r.food}
              </span>
            </span>
          }
        />
      ))}
    </ul>
  );
}

/** One category's public page: the communal record for a single namespace. */
function CategoryPage({
  name,
  stats,
  version,
  userId,
  viewerIsAdmin,
  onChanged,
}: {
  name: string;
  stats: CategoryStat[];
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
}) {
  const { stat, error } = useCategoryStat(name, version);
  const { rankings, error: rankingsError } = useCategoryRankings(stat?.id ?? null, version);

  if (error) return <LoadError className="mx-auto max-w-lg" />;

  if (stat === undefined) return <Loading pad="py-16" />;

  if (stat === null) {
    return (
      <EmptyState
        className="mx-auto max-w-lg"
        line="No category by that name"
        sub={
          <>
            "{name}" hasn't been invented yet.
            <a
              href="#/"
              className="mt-3 block text-sm font-semibold text-clay hover:text-clay-hover"
            >
              ← Back to the board
            </a>
          </>
        }
      />
    );
  }

  const avg = stat.avg_score === null ? null : Number(stat.avg_score);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* min-w-0 so a long category name wraps instead of sizing this column
            to its max-content and pushing the header off a phone screen. */}
        <PageHeader
          className="min-w-0"
          kind="Category"
          title={stat.name}
          sub={
            <>
              {stat.ranking_count} {plural(stat.ranking_count, 'ranking', 'rankings')} ·{' '}
              {stat.ranker_count} {plural(stat.ranker_count, 'person', 'people')}
            </>
          }
        />
        {avg !== null && (
          <span className="flex items-center gap-3">
            <Stars value={avg} />
            <span className={`text-3xl font-bold tabular-nums ${scoreTone(avg)}`}>
              {avg.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {rankingsError ? (
        <LoadError />
      ) : rankings === null ? (
        <Loading />
      ) : rankings.length === 0 ? (
        <EmptyState line="Nothing ranked yet" sub="The first bite is yours." />
      ) : (
        <div className={`${panel} px-5 py-3`}>
          <RankingRows rankings={rankings} userId={userId} onChanged={onChanged} />
        </div>
      )}

      {categoryToolsFor(stat, { userId, isAdmin: viewerIsAdmin, isGuest: false }) && (
        <div className={`${panel} px-5 py-1`}>
          <CategoryTools
            category={stat}
            stats={stats}
            userId={userId}
            viewerIsAdmin={viewerIsAdmin}
            onChanged={onChanged}
            onRenamed={(newName) => {
              window.location.hash = categoryHref(newName).slice(1);
            }}
            onMerged={(targetId) => {
              const target = stats.find((s) => s.id === targetId);
              if (target) window.location.hash = categoryHref(target.name).slice(1);
            }}
            // The page it's on no longer exists; the board is the only place
            // left to be.
            onDeleted={() => {
              window.location.hash = '#/';
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Every review carrying a given #hashtag, newest first. */
function HashtagPage({ hashtag, version }: { hashtag: string; version: number }) {
  const clean = cleanHashtag(hashtag);
  const { rows, error } = useHashtagReviews(clean, version);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kind="Hashtag"
        title={`#${clean}`}
        sub={
          rows === null ? 'Loading…' : `${rows.length} ${plural(rows.length, 'review', 'reviews')}`
        }
      />

      {error ? (
        <LoadError />
      ) : rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState line="No reviews yet" sub={<>Nobody has tagged #{clean} yet.</>} />
      ) : (
        <div className={`${panel} px-5 py-3`}>
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1.5 border-b border-edge py-3 last:border-b-0"
              >
                <p className="m-0 text-sm text-ink italic">
                  "<ReviewText text={r.review ?? ''} />"
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
                  <ProfileLink
                    username={r.profiles?.username ?? null}
                    className="font-semibold"
                    meta={r.profiles}
                  />
                  <span className="text-dim">on</span>
                  <span className="text-ink">{r.food}</span>
                  <span className="text-dim">in</span>
                  {r.categories ? (
                    <CategoryLink name={r.categories.name} />
                  ) : (
                    <span className="font-semibold text-clay">?</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Stars value={Number(r.score)} size={12} />
                    <span className="font-bold tabular-nums text-ink">
                      {Number(r.score).toFixed(1)}
                    </span>
                  </span>
                  <span>· {timeAgo(r.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActivityFeed({
  activity,
  loaded,
  error,
  userId,
  onChanged,
}: {
  activity: ReturnType<typeof useBoard>['activity'];
  loaded: boolean;
  error: string | null;
  userId: string | null;
  onChanged: () => void;
}) {
  if (error) return <LoadError />;

  if (!loaded) return <Loading />;

  if (activity.length === 0) {
    return <EmptyState line="Nothing ranked yet" sub="The first bite is yours." />;
  }

  return (
    <div className={`${panel} px-5 py-3`}>
      <ul className="m-0 flex list-none flex-col p-0">
        {activity.map((a) => (
          <RankingRow
            key={a.id}
            ranking={a}
            userId={userId}
            onChanged={onChanged}
            className="flex flex-col gap-1 border-b border-edge py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
            headline={
              /* Wraps on phones: truncated to one line the sentence always lost
                 its tail — the category, which is the link out of the feed. */
              <span className="block break-words sm:truncate">
                <ProfileLink
                  username={a.profiles?.username ?? null}
                  className="font-bold"
                  meta={a.profiles}
                />{' '}
                <span className="text-dim">ranked</span> {a.food}{' '}
                <span className="text-dim">in</span>{' '}
                {a.categories ? (
                  <CategoryLink name={a.categories.name} />
                ) : (
                  <span className="font-semibold text-clay">?</span>
                )}
              </span>
            }
          />
        ))}
      </ul>
    </div>
  );
}
