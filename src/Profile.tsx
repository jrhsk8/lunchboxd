/**
 * One eater's page: the header and its calling card, the top four, the flair
 * picker, and the owner's and admin's controls over all of it.
 *
 * Its own file rather than a page in `src/App.tsx` because almost none of it is
 * reusable — the rename box, the ban hammer, the pin controls and the studio
 * are all "only on your own profile, or only for an admin", and that condition
 * is what the file is. The parts that other pages do share (the ranking row,
 * the tags, the card) are imported.
 */

import { useState } from 'react';

import { CallingCard, CardStudio } from './CallingCard';
import {
  banProfile,
  renameProfile,
  setProfileTags,
  setTopPick,
  useCardStats,
  useProfile,
  type ProfileRanking,
} from './data';
import { Stars } from './Stars';
import { TOP_SLOTS } from './text';
import {
  CategoryLink,
  kicker,
  LoadError,
  panel,
  profileHref,
  profileTags,
  RankingRow,
  scoreTone,
  SELF_TAGS,
  Tag,
} from './ui';

function Stat({
  label,
  value,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <p className={`m-0 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="m-0 mt-0.5 text-[11px] font-semibold tracking-wider text-dim uppercase">
        {label}
      </p>
    </div>
  );
}

function PinnedRanking({
  ranking,
  own,
  onChanged,
}: {
  ranking: ProfileRanking;
  own: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [unpinFailed, setUnpinFailed] = useState(false);
  const score = Number(ranking.score);

  return (
    <li className={`${panel} relative flex min-h-[96px] flex-col gap-1 px-4 py-3`}>
      {/* pr-6 keeps the food clear of the unpin control in the corner; a food
          name runs to 120 characters and has to wrap, not truncate. */}
      <span className="pr-6 text-[15px] leading-snug font-bold break-words">{ranking.food}</span>
      {ranking.categories && (
        <span className="text-xs break-words">
          <CategoryLink name={ranking.categories.name} />
        </span>
      )}
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
        <Stars value={score} size={12} />
        <span className={`text-sm font-bold tabular-nums ${scoreTone(score)}`}>
          {score.toFixed(1)}
        </span>
        {ranking.hearted && (
          <span className="text-sm text-gold" title="Loved it" aria-label="loved it">
            ♥
          </span>
        )}
      </span>
      {own && (
        <button
          type="button"
          disabled={busy}
          aria-label={`take ${ranking.food} out of your top four`}
          title={unpinFailed ? "That didn't go through" : 'Take it out of your top four'}
          className="absolute top-2 right-2 cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-faint transition-colors hover:text-bad disabled:opacity-40"
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            const { error } = await setTopPick(ranking, false);
            setBusy(false);
            if (error) {
              console.error('lunchboxd: unpin failed —', error);
              setUnpinFailed(true);
              return;
            }
            setUnpinFailed(false);
            onChanged();
          }}
        >
          {unpinFailed ? '!' : '✕'}
        </button>
      )}
    </li>
  );
}

/**
 * The Letterboxd top four: the rankings someone has pinned to the top of their
 * profile, in slot order.
 *
 * Unpinning leaves a hole in the slot numbering, so the cards render in the
 * order they're held rather than one card per slot — otherwise a gap at slot 2
 * would show a stranger an empty box in the middle of someone's four. The empty
 * spots only appear on your own profile, where they're the instruction.
 */
function TopFour({
  picks,
  own,
  onChanged,
}: {
  picks: ProfileRanking[];
  own: boolean;
  onChanged: () => void;
}) {
  if (!own && picks.length === 0) return null;
  const empties = TOP_SLOTS.length - picks.length;

  return (
    <section className="flex flex-col gap-2" aria-label="top four">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`${kicker} m-0`}>Top four</p>
        {own && (
          <p className="m-0 text-xs text-faint">
            {picks.length === 0
              ? 'Pin up to four of your rankings with the ◇ below.'
              : empties === 0
                ? 'All four spots are taken.'
                : `${empties} ${empties === 1 ? 'spot' : 'spots'} left.`}
          </p>
        )}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {picks.map((r) => (
          <PinnedRanking key={r.id} ranking={r} own={own} onChanged={onChanged} />
        ))}
        {own &&
          Array.from({ length: empties }, (_, i) => (
            <li
              key={`empty-${i}`}
              className="flex min-h-[96px] items-center justify-center rounded-(--radius-card) border border-dashed border-edge px-4 py-3 text-center text-xs text-faint"
            >
              Empty spot
            </li>
          ))}
      </ul>
    </section>
  );
}

/** Flair picker on your own profile: toggle any of the fixed self-tags. */
function TagPicker({
  userId,
  current,
  onChanged,
}: {
  userId: string;
  current: string[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(tag: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Flair is either/or (DB-enforced): picking one replaces the other.
    const next = current.includes(tag) ? [] : [tag];
    const { error: err } = await setProfileTags(userId, next);
    setBusy(false);
    // A refused write (banned account, expired session) used to be dropped
    // here, so the chip looked set until the next refetch quietly undid it.
    if (err) {
      setError(err);
      return;
    }
    onChanged();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-wider text-dim uppercase">Your tags</span>
      {SELF_TAGS.map((t) => {
        const on = current.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            disabled={busy}
            title={on ? 'Click to remove' : 'Click to wear it'}
            className={`cursor-pointer rounded-lg border-0 bg-transparent p-0 transition-opacity ${
              on ? '' : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
            }`}
            onClick={() => toggle(t)}
          >
            <Tag kind={t} size={11} />
          </button>
        );
      })}
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}

/**
 * Inline rename on your own profile — the escape hatch for anyone stuck with
 * a serial guest-* handle. On success the page routes to the new handle
 * and `onRenamed` refreshes the cached header name.
 */
function RenameControl({
  userId,
  current,
  onRenamed,
}: {
  userId: string;
  current: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = name.trim();
    if (busy || next.length < 2) return;
    if (next === current) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await renameProfile(userId, next);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onRenamed();
    window.location.hash = profileHref(next).slice(1);
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Pick a new handle (the old one is released for anyone to claim)"
        aria-label="change handle"
        className="cursor-pointer rounded-lg border-0 bg-transparent p-1 text-sm text-faint transition-colors hover:text-clay"
        onClick={() => {
          setName(current);
          setError(null);
          setEditing(true);
        }}
      >
        ✎
      </button>
    );
  }

  return (
    // Takes its own line on phones: sharing the h1 line squeezed the buttons
    // until "Cancel" broke across three lines.
    <span className="flex w-full items-center gap-1.5 sm:w-auto">
      <input
        className="min-w-0 flex-1 rounded-lg border border-edge bg-field px-2 py-1 text-sm font-normal text-ink placeholder:text-faint focus:border-clay focus:outline-none sm:flex-none"
        placeholder="hotdog_hank"
        maxLength={24}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded-lg border border-edge bg-raised px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-ink hover:bg-raised-hover disabled:opacity-40"
        disabled={busy || name.trim().length < 2}
        onClick={save}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs whitespace-nowrap text-faint hover:text-ink"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
      {error && <span className="max-w-64 text-xs font-normal text-bad">{error}</span>}
    </span>
  );
}

/** The admin ban hammer: destructive and loud about it. */
function BanButton({
  targetId,
  username,
  onChanged,
}: {
  targetId: string;
  username: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="cursor-pointer rounded-lg border border-bad/50 bg-bad/10 px-3 py-1.5 text-xs font-bold text-bad transition-colors hover:bg-bad/20 disabled:opacity-40"
        onClick={async () => {
          if (
            !window.confirm(
              `Ban "${username}"? This permanently deletes their rankings AND every category they invented (including everyone else's rankings in those categories), and blocks the account from posting. There is no unban button.`,
            )
          ) {
            return;
          }
          setBusy(true);
          const result = await banProfile(targetId);
          setBusy(false);
          if (result.error) setError(result.error);
          onChanged();
        }}
      >
        {busy ? 'Banning…' : 'Ban profile'}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

/** One eater's public record: who they are, their numbers, everything they've ranked. */
export function ProfilePage({
  username,
  version,
  userId,
  viewerIsAdmin,
  viewerIsGuest,
  onChanged,
  onRenamed,
}: {
  username: string;
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  viewerIsGuest: boolean;
  onChanged: () => void;
  onRenamed: () => void;
}) {
  const { profile, rankings, stats, top, error } = useProfile(username, version);
  const cardStats = useCardStats(profile?.id ?? null, version);
  const [studioOpen, setStudioOpen] = useState(false);

  if (error) return <LoadError />;

  if (profile === undefined)
    return <p className="m-0 py-16 text-center text-sm text-faint">Loading…</p>;

  if (profile === null) {
    return (
      <div className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}>
        <p className="m-0 text-[15px] font-semibold">No one by that handle</p>
        <p className="mt-2 mb-4 text-sm break-words text-dim">
          "{username}" hasn't pulled up a chair here.
        </p>
        <a href="#/" className="text-sm font-semibold text-clay hover:text-clay-hover">
          ← Back to the board
        </a>
      </div>
    );
  }

  const list = rankings ?? [];
  const own = userId === profile.id;
  // The timestamp rather than a boolean off it: the ban notice renders the
  // date, and a boolean derived from a property narrows nothing, which is what
  // the non-null assertion down there was standing in for (#98).
  const bannedAt = profile.banned_at;
  const banned = bannedAt !== null;
  // From profile_stats, not from `list`: the list is capped at 500, and
  // deriving these from it made a heavy eater's lifetime average silently the
  // average of their most recent page.
  const avg = stats?.avg_score == null ? null : Number(stats.avg_score);
  const rankingCount = stats?.ranking_count ?? list.length;
  const categoryCount = stats?.category_count ?? 0;
  const lovedCount = stats?.hearted_count ?? 0;
  const since = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* min-w-0: without it this column sizes to the handle's (or the rename
            row's) max-content and drags the header off a phone screen. */}
        <div className="min-w-0">
          <a href="#/" className="text-xs font-semibold text-faint hover:text-clay">
            ← Back to the board
          </a>
          <p className={`${kicker} mt-4 mb-1.5`}>{own ? 'Your profile' : 'Profile'}</p>
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[28px] font-bold break-all">
            {profile.username}
            {banned && (
              <span className="inline-flex items-center rounded-md border border-bad/40 bg-bad/10 px-2 py-0.5 align-middle text-[11px] font-bold tracking-wider text-bad uppercase">
                Banned
              </span>
            )}
            {!banned && profileTags(profile).map((t) => <Tag key={t} kind={t} size={12} />)}
            {own && !banned && !viewerIsGuest && (
              <RenameControl userId={profile.id} current={profile.username} onRenamed={onRenamed} />
            )}
          </h1>
          <p className="mt-1 mb-0 text-sm text-dim">Eating since {since}</p>
          {/* The nudge sits where the ✎ would be, because this is the moment
              someone wants their own name and the serial number is the reason
              they can't have it. The DB refuses the rename either way. */}
          {own && !banned && viewerIsGuest && (
            <p className="mt-1 mb-0 max-w-md text-sm text-dim">
              Guests eat under a serial number. Add an email up top and you can pick a handle that
              survives a new browser.
            </p>
          )}
        </div>
        {/* The card takes the header's right-hand corner (owner-ruled), so the
            ban button — which used to have it to itself — stacks underneath.
            Full width on phones, where the header wraps; capped on desktop so
            it never crowds the handle. */}
        {!banned && (
          <div className="flex w-full flex-col items-end gap-2 sm:w-auto sm:max-w-[340px]">
            {cardStats && (
              <CallingCard
                className="w-full"
                handle={profile.username}
                tags={profileTags(profile)}
                stats={cardStats}
                slots={[profile.card_slot_1, profile.card_slot_2, profile.card_slot_3]}
                accent={profile.card_accent}
                isSupporter={profile.is_supporter}
                onEdit={own ? () => setStudioOpen((v) => !v) : undefined}
              />
            )}
            {viewerIsAdmin && !own && !profile.is_admin && (
              <BanButton targetId={profile.id} username={profile.username} onChanged={onChanged} />
            )}
          </div>
        )}
        {banned && viewerIsAdmin && !own && !profile.is_admin && (
          <BanButton targetId={profile.id} username={profile.username} onChanged={onChanged} />
        )}
      </div>

      {own && !banned && studioOpen && (
        <CardStudio
          userId={profile.id}
          slots={[profile.card_slot_1, profile.card_slot_2, profile.card_slot_3]}
          accent={profile.card_accent}
          isSupporter={profile.is_supporter}
          onSaved={onChanged}
          onClose={() => setStudioOpen(false)}
        />
      )}

      {own && !banned && (
        <TagPicker userId={profile.id} current={profile.tags} onChanged={onChanged} />
      )}

      {bannedAt !== null ? (
        <div className={`${panel} px-6 py-12 text-center`}>
          <p className="m-0 text-[15px] font-semibold">This account is banned</p>
          <p className="mt-2 mb-0 text-sm text-dim">
            Their rankings and invented categories were removed on{' '}
            {new Date(bannedAt).toLocaleDateString()}.
          </p>
        </div>
      ) : (
        <>
          <TopFour picks={top} own={own} onChanged={onChanged} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={rankingCount === 1 ? 'Ranking' : 'Rankings'}
              value={String(rankingCount)}
            />
            <Stat
              label={categoryCount === 1 ? 'Category' : 'Categories'}
              value={String(categoryCount)}
            />
            <Stat
              label="Average"
              value={avg === null ? '—' : avg.toFixed(2)}
              tone={avg === null ? 'text-faint' : scoreTone(avg)}
            />
            <Stat label="Loved" value={lovedCount ? `♥ ${lovedCount}` : '—'} tone="text-gold" />
          </div>
          {rankings === null ? (
            <p className="m-0 py-8 text-center text-sm text-faint">Loading…</p>
          ) : list.length === 0 ? (
            <div className={`${panel} px-6 py-12 text-center`}>
              <p className="m-0 text-[15px] font-semibold">Nothing ranked yet</p>
              <p className="mt-2 mb-0 text-sm text-dim">
                {own ? 'Your first bite is waiting.' : 'A clean plate so far.'}
              </p>
            </div>
          ) : (
            <div className={`${panel} px-5 py-3`}>
              <ul className="m-0 flex list-none flex-col p-0">
                {list.map((r) => (
                  <RankingRow
                    key={r.id}
                    ranking={r}
                    userId={userId}
                    onChanged={onChanged}
                    controls="owner"
                    pin={own}
                    categoryName={r.categories?.name}
                    className="group flex flex-col gap-1 border-b border-edge py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
                    headline={
                      /* Wraps on phones: one truncated line always cut the
                         category link off the end. */
                      <span className="block break-words sm:truncate">
                        {r.food} <span className="text-dim">in</span>{' '}
                        {r.categories ? (
                          <CategoryLink name={r.categories.name} />
                        ) : (
                          <span className="font-semibold text-clay">?</span>
                        )}
                      </span>
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
