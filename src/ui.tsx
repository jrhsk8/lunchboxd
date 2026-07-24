import { useEffect, useState } from 'react';

import { setHearted, type Ranking } from './data';

export const panel = 'rounded-(--radius-card) border border-edge bg-panel shadow-(--shadow-hard)';
export const kicker = 'text-[11px] font-semibold tracking-[0.16em] uppercase text-clay';

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

export type Route = { page: 'home' } | { page: 'profile'; username: string };

/**
 * Hash routing (#/u/handle) because the site is a static folder under
 * gambdle.net/lunchboxd with no SPA-fallback rewrites. Hashes also never
 * collide with Supabase magic-link fragments (#access_token=…), which the
 * client consumes and clears before these routes matter.
 */
export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const m = /^#\/u\/(.+)$/.exec(hash);
  if (m) {
    try {
      return { page: 'profile', username: decodeURIComponent(m[1]) };
    } catch {
      // Malformed percent-encoding in a hand-typed URL: fall through to home.
    }
  }
  return { page: 'home' };
}

export function profileHref(username: string) {
  return `#/u/${encodeURIComponent(username)}`;
}

/**
 * Username tags, maxout-style: one hue drives text, dot, border, and fill of
 * a small chip. `admin` is granted (never self-picked); the rest are
 * self-service flair from the fixed roster in SELF_TAGS.
 */
export type TagKind = 'admin' | 'peloton' | 'zwift';

export const SELF_TAGS: readonly TagKind[] = ['peloton', 'zwift'];

const TAG_STYLES: Record<TagKind, { label: string; tone: string }> = {
  admin: { label: 'Admin', tone: 'text-admin' },
  peloton: { label: 'Peloton', tone: 'text-peloton' },
  zwift: { label: 'Zwift', tone: 'text-zwift' },
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
  if (!own) {
    return ranking.hearted ? (
      <span className="px-1 text-sm text-gold" title="They loved it" aria-label="loved it">
        ♥
      </span>
    ) : (
      <span className="w-[26px]" aria-hidden />
    );
  }
  return (
    <button
      type="button"
      aria-label={ranking.hearted ? 'unmark loved' : 'mark as loved'}
      aria-pressed={ranking.hearted}
      title={ranking.hearted ? 'You loved it — click to unmark' : 'Loved it?'}
      className={`cursor-pointer rounded border-0 bg-transparent px-1 text-sm transition-transform hover:scale-115 ${
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
