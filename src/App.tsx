import { useEffect, useState } from 'react';

import { KeepAccount, SignInCard, useAuth } from './auth';
import {
  deleteRanking,
  mergeCategories,
  rankFood,
  renameCategory,
  useBoard,
  useCategoryRankings,
  useCategoryStat,
  type CategoryStat,
  type Ranking,
} from './data';
import { ProfilePage } from './Profile';
import { StarInput, Stars } from './Stars';
import { supabase } from './supabase';
import {
  categoryHref,
  CategoryLink,
  Heart,
  kicker,
  panel,
  profileHref,
  scoreTone,
  Tag,
  timeAgo,
  UserLink,
  useRoute,
} from './ui';

const NEW_SENTINEL = '__new__';

const btnPrimary =
  'cursor-pointer rounded-lg border border-transparent bg-clay px-4 py-2.5 text-sm font-bold text-field transition-colors hover:bg-clay-hover disabled:cursor-default disabled:opacity-40';
const input =
  'rounded-lg border border-edge bg-field px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-clay focus:outline-none';
const label = 'flex flex-col gap-1.5 text-[11px] font-semibold tracking-wider text-dim uppercase';

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
  const { stats, activity, loaded, version, refresh } = useBoard();
  const route = useRoute();
  const [tab, setTab] = useState<'categories' | 'activity'>('categories');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  const routeKey =
    route.page === 'profile'
      ? `u/${route.username}`
      : route.page === 'category'
        ? `c/${route.name}`
        : 'home';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  const totalRankings = stats.reduce((n, c) => n + c.ranking_count, 0);

  return (
    <div className="mx-auto max-w-[1140px] p-[clamp(16px,4vw,40px)]">
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
          <span className="text-xs text-faint tabular-nums">
            {totalRankings} rankings · {stats.length} categories
          </span>
          {session && (
            <>
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
              {session.user.is_anonymous && <KeepAccount />}
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint hover:text-ink"
                onClick={() => {
                  if (
                    session.user.is_anonymous &&
                    !window.confirm(
                      `Guest accounts can't be recovered: sign out and ${username ? `"${username}"` : 'your handle'} is gone for good (your rankings stay up). Use "Keep account" first to attach an email. Sign out anyway?`,
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

      {route.page === 'category' ? (
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
              <div className="flex gap-1 self-start rounded-(--radius-card) border-2 border-edge bg-raised p-1">
                {(['categories', 'activity'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
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

              {tab === 'categories' ? (
                <CategoryBoard
                  stats={stats}
                  loaded={loaded}
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
                  userId={session?.user.id ?? null}
                  onChanged={refresh}
                />
              )}
            </section>
          </div>
        </>
      )}

      <footer className="mt-10 flex items-center justify-center gap-4 pb-2">
        <span className="text-xs text-faint">
          Lunchboxd — like Letterboxd, but you can eat the subject matter.
        </span>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint underline hover:text-dim"
          onClick={() => setShowTerms(true)}
        >
          Terms of service
        </button>
      </footer>

      {showTerms && <Terms onClose={() => setShowTerms(false)} />}
    </div>
  );
}

function Terms({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="terms of service"
        className={`${panel} max-h-[85vh] w-full max-w-lg overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className={`${kicker} m-0`}>Terms of service</p>
          <button
            type="button"
            aria-label="close"
            className="cursor-pointer border-0 bg-transparent p-1 text-sm text-faint hover:text-ink"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-dim">
          <p className="m-0">
            <span className="font-bold text-ink">We do not collect your data.</span> No analytics,
            no tracking, no ads, no cookies beyond the session that keeps you signed in, and nothing
            is ever sold or shared with anyone.
          </p>
          <p className="m-0">
            The only things stored are what you post to make the site work: your handle, the
            categories you invent, the foods you rank, and the hearts you give. If you sign in by
            email, the address is used solely to send you the sign-in link.
          </p>
          <p className="m-0">
            Everything you post is public — your handle, rankings, and hearts are visible to
            everyone. You can delete your own rankings at any time.
          </p>
          <p className="m-0">
            Scores are a matter of taste. If the crowd says gas station sushi is a 4.5, the crowd
            has spoken.
          </p>
        </div>
      </div>
    </div>
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
  const [categoryChoice, setCategoryChoice] = useState(NEW_SENTINEL);
  const [newCategory, setNewCategory] = useState('');
  const [food, setFood] = useState('');
  const [review, setReview] = useState('');
  const [score, setScore] = useState(0);
  const [loved, setLoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creatingNew = categoryChoice === NEW_SENTINEL;
  const canLog =
    !busy && score > 0 && food.trim() !== '' && (!creatingNew || newCategory.trim() !== '');

  async function submit() {
    if (!canLog) return;
    setBusy(true);
    setError(null);
    const result = await rankFood({
      userId,
      categoryId: creatingNew ? undefined : categoryChoice,
      categoryName: creatingNew ? newCategory : undefined,
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
    setNewCategory('');
    onLogged();
  }

  return (
    <div className="flex flex-col gap-4">
      <label className={label}>
        Category
        <select
          className={input}
          value={categoryChoice}
          onChange={(e) => setCategoryChoice(e.target.value)}
        >
          <option value={NEW_SENTINEL}>+ New category…</option>
          {stats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {creatingNew && (
        <label className={label}>
          Category name
          <input
            className={input}
            placeholder="Pizza, Gas Station Sushi, Soup-Adjacent…"
            maxLength={60}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        </label>
      )}

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
          placeholder="Cold by the time I got home. Still perfect."
          rows={2}
          maxLength={2000}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-wider text-dim uppercase">Score</span>
        <div className="flex items-center justify-between gap-3">
          <StarInput value={score} onChange={setScore} />
          <button
            type="button"
            aria-pressed={loved}
            title="The Letterboxd heart: loved it, whatever the score"
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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
  openId,
  setOpenId,
  version,
  userId,
  viewerIsAdmin,
  onChanged,
}: {
  stats: CategoryStat[];
  loaded: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
}) {
  if (!loaded) return <p className="m-0 py-8 text-center text-sm text-faint">Loading…</p>;

  if (stats.length === 0) {
    return (
      <div className={`${panel} px-6 py-12 text-center`}>
        <p className="m-0 text-[15px] font-semibold">No categories yet</p>
        <p className="mx-auto mt-2 mb-0 max-w-sm text-sm text-dim">
          Rank the first food and invent one for everybody. "Handheld Breakfast" is a category.
          "Things Served in a Bread Bowl" is a category. Go nuts.
        </p>
      </div>
    );
  }

  return (
    <>
      {stats.map((c, i) => {
        const avg = c.avg_score === null ? null : Number(c.avg_score);
        const open = openId === c.id;
        return (
          <article key={c.id} className={`${panel} overflow-hidden`}>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-5 py-4 text-left font-sans text-ink transition-colors hover:bg-raised"
              onClick={() => setOpenId(open ? null : c.id)}
              aria-expanded={open}
            >
              <span className="w-7 text-sm font-bold text-faint tabular-nums">
                {avg === null ? '—' : `#${i + 1}`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{c.name}</span>
                <span className="mt-0.5 block text-xs text-faint">
                  {c.ranking_count} {c.ranking_count === 1 ? 'ranking' : 'rankings'} ·{' '}
                  {c.ranker_count} {c.ranker_count === 1 ? 'person' : 'people'}
                </span>
              </span>
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
              <span className="text-[10px] text-faint" aria-hidden>
                {open ? '▲' : '▼'}
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
              />
            )}
          </article>
        );
      })}
    </>
  );
}

/** Admin-only category surgery inside the expanded panel: rename, or fold into another. */
function CategoryAdminTools({
  category,
  stats,
  onChanged,
  onRenamed,
  onMerged,
}: {
  category: CategoryStat;
  stats: CategoryStat[];
  onChanged: () => void;
  onRenamed?: (newName: string) => void;
  onMerged: (targetId: string) => void;
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

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
      <span className="text-[11px] font-semibold tracking-wider text-dim uppercase">Admin</span>
      {renaming ? (
        <>
          <input
            className="rounded-lg border border-edge bg-field px-2 py-1 text-xs text-ink focus:border-clay focus:outline-none"
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
      <select
        className="rounded-lg border border-edge bg-field px-2 py-1 text-xs text-ink focus:border-clay focus:outline-none"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Merge into…</option>
        {stats
          .filter((s) => s.id !== category.id)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
      <button type="button" className={btnSmall} disabled={busy || !target} onClick={merge}>
        Merge
      </button>
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
}: {
  category: CategoryStat;
  stats: CategoryStat[];
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
  onMerged: (targetId: string) => void;
}) {
  const rankings = useCategoryRankings(category.id, version);

  if (rankings === null)
    return <p className="m-0 border-t-2 border-edge px-5 py-4 text-sm text-faint">Loading…</p>;

  const mine = userId ? rankings.filter((r) => r.user_id === userId) : [];
  const myAvg = mine.length ? mine.reduce((s, r) => s + Number(r.score), 0) / mine.length : null;

  return (
    <div className="border-t-2 border-edge bg-field/40 px-5 py-4">
      <p className="mt-0 mb-3 flex items-baseline justify-between gap-3 text-xs">
        {myAvg !== null ? (
          <span className="text-dim">
            Your average here:{' '}
            <span className={`font-bold tabular-nums ${scoreTone(myAvg)}`}>{myAvg.toFixed(2)}</span>{' '}
            across {mine.length} {mine.length === 1 ? 'ranking' : 'rankings'}
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
      {viewerIsAdmin && (
        <CategoryAdminTools
          category={category}
          stats={stats}
          onChanged={onChanged}
          onMerged={onMerged}
        />
      )}
    </div>
  );
}

/** The ranking-row list shared by the expanded board panel and the category page. */
function RankingRows({
  rankings,
  userId,
  onChanged,
}: {
  rankings: Ranking[];
  userId: string | null;
  onChanged: () => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rankings.map((r) => (
        <li
          key={r.id}
          className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-raised"
        >
          <span className="min-w-0 flex-1 text-sm">
            <span className="block truncate">
              {r.food}
              <span className="ml-2 text-xs text-faint">
                <UserLink username={r.profiles?.username ?? null} meta={r.profiles} />
                {userId === r.user_id && ' (you)'}
              </span>
            </span>
            {r.review && (
              <span className="mt-0.5 block truncate text-xs text-dim italic" title={r.review}>
                "{r.review}"
              </span>
            )}
          </span>
          <span className="w-14 shrink-0 text-right text-xs text-faint tabular-nums">
            {timeAgo(r.created_at)}
          </span>
          <Stars value={Number(r.score)} size={13} />
          <span className="w-8 text-right text-sm font-bold tabular-nums">
            {Number(r.score).toFixed(1)}
          </span>
          <Heart ranking={r} userId={userId} onChanged={onChanged} />
          {userId === r.user_id ? (
            <button
              type="button"
              className="w-[22px] shrink-0 cursor-pointer rounded border-0 bg-transparent px-0 text-center text-sm text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
              aria-label={`delete ${r.food}`}
              onClick={async () => {
                await deleteRanking(r.id);
                onChanged();
              }}
            >
              ✕
            </button>
          ) : (
            <span className="w-[22px] shrink-0" aria-hidden />
          )}
        </li>
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
  const stat = useCategoryStat(name, version);
  const rankings = useCategoryRankings(stat?.id ?? null, version);

  if (stat === undefined)
    return <p className="m-0 py-16 text-center text-sm text-faint">Loading…</p>;

  if (stat === null) {
    return (
      <div className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}>
        <p className="m-0 text-[15px] font-semibold">No category by that name</p>
        <p className="mt-2 mb-4 text-sm text-dim">"{name}" hasn't been invented yet.</p>
        <a href="#/" className="text-sm font-semibold text-clay hover:text-clay-hover">
          ← Back to the board
        </a>
      </div>
    );
  }

  const avg = stat.avg_score === null ? null : Number(stat.avg_score);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="#/" className="text-xs font-semibold text-faint hover:text-clay">
            ← Back to the board
          </a>
          <p className={`${kicker} mt-4 mb-1.5`}>Category</p>
          <h1 className="m-0 text-[28px] font-bold">{stat.name}</h1>
          <p className="mt-1 mb-0 text-sm text-dim">
            {stat.ranking_count} {stat.ranking_count === 1 ? 'ranking' : 'rankings'} ·{' '}
            {stat.ranker_count} {stat.ranker_count === 1 ? 'person' : 'people'}
          </p>
        </div>
        {avg !== null && (
          <span className="flex items-center gap-3">
            <Stars value={avg} />
            <span className={`text-3xl font-bold tabular-nums ${scoreTone(avg)}`}>
              {avg.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {rankings === null ? (
        <p className="m-0 py-8 text-center text-sm text-faint">Loading…</p>
      ) : rankings.length === 0 ? (
        <div className={`${panel} px-6 py-12 text-center`}>
          <p className="m-0 text-[15px] font-semibold">Nothing ranked yet</p>
          <p className="mt-2 mb-0 text-sm text-dim">The first bite is yours.</p>
        </div>
      ) : (
        <div className={`${panel} px-5 py-3`}>
          <RankingRows rankings={rankings} userId={userId} onChanged={onChanged} />
        </div>
      )}

      {viewerIsAdmin && (
        <div className={`${panel} px-5 py-1`}>
          <CategoryAdminTools
            category={stat}
            stats={stats}
            onChanged={onChanged}
            onRenamed={(newName) => {
              window.location.hash = categoryHref(newName).slice(1);
            }}
            onMerged={(targetId) => {
              const target = stats.find((s) => s.id === targetId);
              if (target) window.location.hash = categoryHref(target.name).slice(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ActivityFeed({
  activity,
  loaded,
  userId,
  onChanged,
}: {
  activity: ReturnType<typeof useBoard>['activity'];
  loaded: boolean;
  userId: string | null;
  onChanged: () => void;
}) {
  if (!loaded) return <p className="m-0 py-8 text-center text-sm text-faint">Loading…</p>;

  if (activity.length === 0) {
    return (
      <div className={`${panel} px-6 py-12 text-center`}>
        <p className="m-0 text-[15px] font-semibold">Nothing ranked yet</p>
        <p className="mt-2 mb-0 text-sm text-dim">The first bite is yours.</p>
      </div>
    );
  }

  return (
    <div className={`${panel} px-5 py-3`}>
      <ul className="m-0 flex list-none flex-col p-0">
        {activity.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 border-b border-edge py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate">
                <UserLink
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
              {a.review && (
                <span className="mt-0.5 block truncate text-xs text-dim italic" title={a.review}>
                  "{a.review}"
                </span>
              )}
            </span>
            <span className="w-14 shrink-0 text-right text-xs text-faint tabular-nums">
              {timeAgo(a.created_at)}
            </span>
            <Stars value={Number(a.score)} size={13} />
            <span className="w-8 text-right text-sm font-bold tabular-nums">
              {Number(a.score).toFixed(1)}
            </span>
            <Heart ranking={a} userId={userId} onChanged={onChanged} />
          </li>
        ))}
      </ul>
    </div>
  );
}
