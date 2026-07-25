import { useEffect, useRef, useState, type ReactNode } from 'react';

import { deleteRanking, setHearted, setTopPick, updateRanking, type Ranking } from './data';
import { StarInput, Stars } from './Stars';
import { HASHTAG_RE, timeAgo } from './text';

export { hashtagsIn, timeAgo } from './text';

export const panel = 'rounded-(--radius-card) border border-edge bg-panel shadow-(--shadow-hard)';
export const kicker = 'text-[11px] font-semibold tracking-[0.16em] uppercase text-clay';

// The shared control idioms. These lived twice — once in App.tsx and once in
// auth.tsx, whose copy had drifted an extra `w-full` — and nothing stopped them
// drifting further. auth.tsx composes `w-full` on top rather than keeping a
// second copy.
export const btnPrimary =
  'cursor-pointer rounded-lg border border-transparent bg-clay px-4 py-2.5 text-sm font-bold text-field transition-colors hover:bg-clay-hover disabled:cursor-default disabled:opacity-40';
export const input =
  'rounded-lg border border-edge bg-field px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-clay focus:outline-none';
export const label =
  'flex flex-col gap-1.5 text-[11px] font-semibold tracking-wider text-dim uppercase';

/**
 * The one-line italic review quote under a feed headline. Desktop keeps the
 * single ellipsised line (the full text is in the `title` tooltip); phones get
 * three lines instead, because a touch device never sees that tooltip and one
 * line at 320px is a dozen words.
 */
export const reviewLine =
  'mt-0.5 line-clamp-3 text-xs text-dim italic sm:block sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap';

export function scoreTone(avg: number) {
  if (avg >= 4) return 'text-good';
  if (avg < 2.5) return 'text-bad';
  return 'text-ink';
}

export type Route =
  | { page: 'home' }
  | { page: 'profile'; username: string }
  | { page: 'category'; name: string }
  | { page: 'tag'; tag: string }
  | { page: 'terms' };

/**
 * Hash routing (#/u/handle, #/c/category, #/t/hashtag) because the site is a
 * static build on Cloudflare Pages (lunchboxd.live) with no SPA-fallback rewrites.
 * Hashes also never collide with Supabase magic-link fragments (#access_token=…),
 * which the client consumes and clears before these routes matter.
 */
export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#/terms') return { page: 'terms' };
  const m = /^#\/([uct])\/(.+)$/.exec(hash);
  if (m) {
    try {
      const value = decodeURIComponent(m[2]);
      if (m[1] === 'u') return { page: 'profile', username: value };
      if (m[1] === 'c') return { page: 'category', name: value };
      return { page: 'tag', tag: value };
    } catch {
      // Malformed percent-encoding in a hand-typed URL: fall through to home.
    }
  }
  return { page: 'home' };
}

export function profileHref(username: string) {
  return `#/u/${encodeURIComponent(username)}`;
}

export function categoryHref(name: string) {
  return `#/c/${encodeURIComponent(name)}`;
}

export function tagHref(tag: string) {
  return `#/t/${encodeURIComponent(tag.toLowerCase())}`;
}

/** Renders review text with #hashtags turned into links to their tag page. */
export function ReviewText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tagStart = (m.index ?? 0) + m[1].length;
    if (tagStart > last) nodes.push(text.slice(last, tagStart));
    const tag = m[2];
    nodes.push(
      <a
        key={tagStart}
        href={tagHref(tag)}
        className="font-semibold text-clay hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        #{tag}
      </a>,
    );
    last = tagStart + 1 + tag.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/**
 * A review under a feed headline: clamped to a line on desktop and three on a
 * phone, with a "more" toggle when there is text beyond the clamp.
 *
 * A review can run to 2000 characters and there was nowhere on the site it
 * rendered in full — desktop hid the rest in a `title` tooltip, which a touch
 * device never sees, so long reviews were simply unreadable on a phone.
 * Whether the text actually overflows depends on the viewport, so it's
 * measured rather than guessed from length.
 */
export function ReviewQuote({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () =>
      setClamped(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  return (
    <div className={className}>
      <p ref={ref} className={open ? 'mt-0.5 text-xs text-dim italic' : reviewLine}>
        “<ReviewText text={text} />”
      </p>
      {(clamped || open) && (
        <button
          type="button"
          className="mt-0.5 cursor-pointer rounded border-0 bg-transparent p-0 text-[11px] font-semibold text-clay hover:underline"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

/** A category name that navigates to its page, clay like every category mention. */
export function CategoryLink({ name, className = '' }: { name: string; className?: string }) {
  return (
    <a
      href={categoryHref(name)}
      className={`font-semibold text-clay hover:text-clay-hover hover:underline ${className}`}
      title={`${name} — category page`}
    >
      {name}
    </a>
  );
}

/**
 * Username tags, maxout-style: one hue drives text, dot, border, and fill of
 * a small chip. `admin` and `supporter` are granted in SQL and live in their
 * own columns; the rest are self-service flair from the fixed roster in
 * SELF_TAGS. Someone can wear both kinds at once — the granted ones don't
 * spend the single flair slot.
 */
export type TagKind = 'admin' | 'supporter' | 'peloton' | 'zwift' | 'runner';

export const SELF_TAGS: readonly TagKind[] = ['peloton', 'zwift', 'runner'];

const TAG_STYLES: Record<TagKind, { label: string; tone: string }> = {
  admin: { label: 'Admin', tone: 'text-admin' },
  supporter: { label: 'Supporter', tone: 'text-supporter' },
  peloton: { label: 'Peloton', tone: 'text-peloton' },
  zwift: { label: 'Zwift', tone: 'text-zwift' },
  runner: { label: 'Runner', tone: 'text-runner' },
};

export function Tag({ kind, size = 10 }: { kind: TagKind; size?: number }) {
  const { label, tone } = TAG_STYLES[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-current/35 bg-current/10 px-1.5 py-px align-middle font-semibold whitespace-nowrap ${tone}`}
      style={{ fontSize: size }}
    >
      <span className="h-1 w-1 rounded-[2px] bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** The tags a profile wears, in display order: granted first, then flair. */
export function profileTags(p: ProfileBadges | null): TagKind[] {
  if (!p) return [];
  // Narrowed to SELF_TAGS rather than to TAG_STYLES: `tags` is a user-writable
  // column, so matching it against every known chip would be one dropped check
  // constraint away from letting somebody render their own Supporter badge.
  const flair = (p.tags ?? []).filter((t): t is TagKind =>
    (SELF_TAGS as readonly string[]).includes(t),
  );
  const granted: TagKind[] = [];
  if (p.is_admin) granted.push('admin');
  if (p.is_supporter) granted.push('supporter');
  return [...granted, ...flair];
}

/** The fields of a profile that decide which chips sit after its handle. */
type ProfileBadges = { is_admin?: boolean; is_supporter?: boolean; tags?: string[] };

export function UserLink({
  username,
  className = '',
  meta = null,
}: {
  username: string | null;
  className?: string;
  meta?: ProfileBadges | null;
}) {
  if (!username) return <span className={className}>someone</span>;
  return (
    <>
      <a
        href={profileHref(username)}
        className={`${className} hover:text-clay hover:underline`}
        title={`${username}'s profile`}
      >
        {username}
      </a>
      {profileTags(meta).map((t) => (
        <span key={t} className="ml-1.5">
          <Tag kind={t} size={9} />
        </span>
      ))}
    </>
  );
}

/**
 * What a failed fetch renders instead of an empty state.
 *
 * Every hook used to drop its `error`, so an outage, a dead connection or an
 * expired PostgREST schema cache all produced "No categories yet — Rank the
 * first food and invent one for everybody": the site cheerfully reporting
 * emptiness as fact. Emptiness and failure now look different, because they
 * are.
 */
export function LoadError({ className = '' }: { className?: string }) {
  return (
    <div className={`${panel} px-6 py-12 text-center ${className}`}>
      <p className="m-0 text-[15px] font-semibold">Couldn&rsquo;t reach the kitchen</p>
      <p className="mx-auto mt-2 mb-4 max-w-sm text-sm text-dim">
        Something went wrong loading this — it&rsquo;s us, not you. Nothing you&rsquo;ve logged is
        affected.
      </p>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-clay hover:text-clay-hover"
        onClick={() => window.location.reload()}
      >
        Try again
      </button>
    </div>
  );
}

/**
 * One row of a ranking list: headline on the left, then the fixed columns —
 * time, stars, score, heart, and the owner's controls.
 *
 * This existed three times (the expanded board panel, the activity feed, the
 * profile page), each ~40 lines of the same flex / `sm:contents` mobile
 * choreography, differing only in what the headline said. Every mobile fix had
 * to be made three times by hand, and app-shell.md documents five idioms that
 * have to stay consistent across them.
 *
 * `controls` is 'none' for the activity feed, which doesn't reserve the column
 * at all; 'owner' elsewhere, where the column is held open for alignment even
 * on rows you don't own.
 *
 * `pin` adds the top-four control. It's off everywhere but your own profile:
 * the top four is a thing you curate about yourself, in the one place it's
 * displayed, and a fourth small control on every row of the board and the feed
 * is a row that doesn't fit a phone.
 */
export function RankingRow({
  ranking,
  userId,
  onChanged,
  headline,
  className,
  controls = 'none',
  categoryName,
  pin = false,
}: {
  ranking: Ranking;
  userId: string | null;
  onChanged: () => void;
  headline: ReactNode;
  className: string;
  controls?: 'none' | 'owner';
  categoryName?: string;
  pin?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const own = userId === ranking.user_id;
  const where = categoryName ? ` in ${categoryName}` : '';

  if (editing) {
    return (
      <li className={className}>
        <EditRanking
          ranking={ranking}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className={className}>
      <span className="min-w-0 text-sm sm:flex-1">
        {headline}
        {ranking.review && <ReviewQuote text={ranking.review} />}
      </span>
      <span className="flex items-center gap-3 sm:contents">
        <span className="w-14 shrink-0 text-left text-xs text-faint tabular-nums sm:text-right">
          {timeAgo(ranking.created_at)}
        </span>
        <Stars value={Number(ranking.score)} size={13} />
        <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums">
          {Number(ranking.score).toFixed(1)}
        </span>
        <Heart ranking={ranking} userId={userId} onChanged={onChanged} />
        {controls === 'owner' &&
          (own ? (
            <>
              {pin && <TopPin ranking={ranking} onChanged={onChanged} />}
              <button
                type="button"
                className={ownerControl}
                aria-label={`edit ${ranking.food}`}
                onClick={() => setEditing(true)}
              >
                ✎
              </button>
              <button
                type="button"
                className={`${ownerControl} hover:text-bad`}
                aria-label={`delete ${ranking.food}`}
                onClick={async () => {
                  // The only destructive action here with no guard until now,
                  // sitting one fingertip from the heart on a phone, where the
                  // control is always visible rather than hover-revealed.
                  if (
                    !window.confirm(
                      `Delete your ranking of "${ranking.food}"${where}? It's gone for good, and the average recomputes without it.`,
                    )
                  ) {
                    return;
                  }
                  const { error } = await deleteRanking(ranking.id);
                  if (error) {
                    console.error('lunchboxd: delete failed —', error);
                    window.alert("That didn't go through. Try again in a moment.");
                    return;
                  }
                  onChanged();
                }}
              >
                ✕
              </button>
            </>
          ) : (
            <span className={`shrink-0 ${pin ? 'w-[68px]' : 'w-[46px]'}`} aria-hidden />
          ))}
      </span>
    </li>
  );
}

const controlBase =
  'w-[22px] shrink-0 cursor-pointer rounded border-0 bg-transparent px-0 text-center text-sm transition-opacity';

const ownerControl = `${controlBase} text-faint opacity-100 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100`;

/**
 * The top-four pin, on your own rankings: a filled diamond in the slot it
 * holds, a hollow one otherwise.
 *
 * A pinned row keeps its mark visible rather than borrowing `ownerControl`'s
 * hover-reveal — the diamond is state, not just a control, and a mark that
 * only appears on hover tells you nothing on a touch screen and nothing at a
 * glance anywhere else.
 */
function TopPin({ ranking, onChanged }: { ranking: Ranking; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const pinned = ranking.top_rank !== null;

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={pinned}
      aria-label={
        pinned
          ? `take ${ranking.food} out of your top four`
          : `pin ${ranking.food} to your top four`
      }
      title={
        pinned
          ? `Number ${ranking.top_rank} in your top four — click to take it out`
          : 'Pin to your top four'
      }
      className={
        pinned
          ? `${controlBase} text-clay hover:text-clay-hover`
          : `${ownerControl} hover:text-clay`
      }
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        const { error } = await setTopPick(ranking, !pinned);
        setBusy(false);
        if (error) {
          // Being told the four are full is an ordinary answer, not a failure,
          // so it's shown rather than logged.
          window.alert(error);
          return;
        }
        onChanged();
      }}
    >
      {pinned ? '◆' : '◇'}
    </button>
  );
}

/**
 * Inline editor for your own ranking. Editing used to mean delete-and-re-log,
 * which cost the timestamp, the feed position and the heart to fix a typo;
 * data-model.md recorded that as deliberate, and it was reversed 2026-07-25.
 *
 * Edits are silent — no "edited" marker, and `created_at` is untouched, so
 * editing cannot re-float a ranking to the top of the activity feed.
 */
function EditRanking({
  ranking,
  onClose,
  onSaved,
}: {
  ranking: Ranking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [food, setFood] = useState(ranking.food);
  const [score, setScore] = useState(Number(ranking.score));
  const [review, setReview] = useState(ranking.review ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy || !food.trim() || score <= 0) return;
    setBusy(true);
    setError(null);
    const result = await updateRanking(ranking.id, { food, score, review });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="flex w-full flex-col gap-3 py-1"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <input
        className={input}
        maxLength={120}
        value={food}
        autoFocus
        aria-label="what did you eat"
        onChange={(e) => setFood(e.target.value)}
      />
      <StarInput value={score} onChange={setScore} />
      <textarea
        className={`${input} resize-none`}
        rows={2}
        maxLength={2000}
        value={review}
        aria-label="review"
        placeholder="Review (optional)"
        onChange={(e) => setReview(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint hover:text-ink"
          onClick={onClose}
        >
          Cancel
        </button>
        {error && <span className="text-xs text-bad">{error}</span>}
      </div>
    </div>
  );
}

/**
 * The Letterboxd heart: a mark the AUTHOR puts on their own ranking ("loved
 * it", independent of the score). Everyone sees it; only the owner can flip
 * it. Non-owners get a plain glyph (gold when hearted, nothing otherwise).
 */
export function Heart({
  ranking,
  userId,
  onChanged,
}: {
  ranking: Ranking;
  userId: string | null;
  onChanged: () => void;
}) {
  const own = userId === ranking.user_id;
  // The write round-trips and then the whole board refetches before the glyph
  // would move, which is a visible dead beat on the most repeated interaction
  // on the site. Flip locally first; `pending` is cleared once the refetch
  // brings the server's answer back, and dropped on a rejected write.
  const [pending, setPending] = useState<boolean | null>(null);
  // Adjusted during render rather than in an effect: when the refetch brings a
  // new server value the optimistic one is spent, and an effect would render
  // the stale glyph once before correcting it.
  const [seen, setSeen] = useState(ranking.hearted);
  if (seen !== ranking.hearted) {
    setSeen(ranking.hearted);
    setPending(null);
  }
  const hearted = pending ?? ranking.hearted;

  // Every variant is the same fixed width so the feed columns line up.
  if (!own) {
    return ranking.hearted ? (
      <span
        className="inline-flex w-[26px] shrink-0 justify-center text-sm text-gold"
        title="They loved it"
        aria-label="loved it"
      >
        ♥
      </span>
    ) : (
      <span className="w-[26px] shrink-0" aria-hidden />
    );
  }
  return (
    <button
      type="button"
      aria-label={hearted ? 'unmark loved' : 'mark as loved'}
      aria-pressed={hearted}
      title={hearted ? 'You loved it — click to unmark' : 'Loved it?'}
      className={`w-[26px] shrink-0 cursor-pointer rounded border-0 bg-transparent px-0 text-center text-sm transition-transform hover:scale-115 ${
        hearted ? 'text-gold' : 'text-faint hover:text-gold'
      }`}
      onClick={async () => {
        const next = !hearted;
        setPending(next);
        const { error } = await setHearted(ranking.id, next);
        if (error) {
          // Rejected — banned account, expired session, a policy change. Put
          // the glyph back rather than letting a later refetch snap it.
          setPending(null);
          console.error('lunchboxd: heart failed —', error);
          return;
        }
        onChanged();
      }}
    >
      {hearted ? '♥' : '♡'}
    </button>
  );
}
