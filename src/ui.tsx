import { useEffect, useState, type ReactNode } from 'react';

import { setHearted, type Ranking } from './data';

export const panel = 'rounded-(--radius-card) border border-edge bg-panel shadow-(--shadow-hard)';
export const kicker = 'text-[11px] font-semibold tracking-[0.16em] uppercase text-clay';

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

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export type Route =
  | { page: 'home' }
  | { page: 'profile'; username: string }
  | { page: 'category'; name: string }
  | { page: 'tag'; tag: string };

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

// A hashtag: '#' + word chars, only when not glued to a preceding word char
// (so "a#b" and URL fragments like "x#frag" don't count). Capture group 1 is
// the leading boundary char (kept as text), group 2 is the tag. No lookbehind,
// for older-Safari safety.
const HASHTAG_RE = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_]+)/g;

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
 * a small chip. `admin` is granted (never self-picked); the rest are
 * self-service flair from the fixed roster in SELF_TAGS.
 */
export type TagKind = 'admin' | 'peloton' | 'zwift' | 'runner';

export const SELF_TAGS: readonly TagKind[] = ['peloton', 'zwift', 'runner'];

const TAG_STYLES: Record<TagKind, { label: string; tone: string }> = {
  admin: { label: 'Admin', tone: 'text-admin' },
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
export function profileTags(p: { is_admin?: boolean; tags?: string[] } | null): TagKind[] {
  if (!p) return [];
  const flair = (p.tags ?? []).filter((t): t is TagKind => t in TAG_STYLES);
  return p.is_admin ? ['admin', ...flair] : flair;
}

export function UserLink({
  username,
  className = '',
  meta = null,
}: {
  username: string | null;
  className?: string;
  meta?: { is_admin?: boolean; tags?: string[] } | null;
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
      aria-label={ranking.hearted ? 'unmark loved' : 'mark as loved'}
      aria-pressed={ranking.hearted}
      title={ranking.hearted ? 'You loved it — click to unmark' : 'Loved it?'}
      className={`w-[26px] shrink-0 cursor-pointer rounded border-0 bg-transparent px-0 text-center text-sm transition-transform hover:scale-115 ${
        ranking.hearted ? 'text-gold' : 'text-faint hover:text-gold'
      }`}
      onClick={async () => {
        await setHearted(ranking.id, !ranking.hearted);
        onChanged();
      }}
    >
      {ranking.hearted ? '♥' : '♡'}
    </button>
  );
}
