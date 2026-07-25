/**
 * The pure text/time helpers, kept apart from ui.tsx so they can be tested
 * without dragging in React or the Supabase client (which reads import.meta.env
 * at module load).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Relative for the first month, absolute after that. "731d ago" was both
 * useless and too wide for the fixed column it sits in; on a profile page — a
 * chronological record — "12 Mar" is the more useful reading anyway. The year
 * appears once the date is in a previous one, or "12 Mar" is ambiguous.
 *
 * `now` is injectable so the behaviour is testable without freezing the clock.
 */
export function timeAgo(iso: string, now: number = Date.now()) {
  const then = new Date(iso);
  const s = Math.max(0, (now - then.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  const label = `${then.getDate()} ${MONTHS[then.getMonth()]}`;
  return then.getFullYear() === new Date(now).getFullYear()
    ? label
    : `${label} ${String(then.getFullYear()).slice(2)}`;
}

/**
 * A hashtag: '#' + word chars, only when not glued to a preceding word char
 * (so "a#b" and URL fragments like "x#frag" don't count). Capture group 1 is
 * the leading boundary char (kept as text), group 2 is the tag. No lookbehind,
 * for older-Safari safety.
 *
 * These boundary rules are duplicated server-side by useTagReviews' refinement
 * regex; both are covered by ui.test.ts, because a drift between them shows up
 * as a tag page listing reviews that don't carry the tag.
 */
export const HASHTAG_RE = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_]+)/g;

/** Every hashtag in a review, in order, without the leading '#'. */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(HASHTAG_RE)].map((m) => m[2]);
}
