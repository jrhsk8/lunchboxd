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
 * These boundary rules are duplicated server-side by useHashtagReviews' refinement
 * regex; both are covered by ui.test.ts, because a drift between them shows up
 * as a tag page listing reviews that don't carry the tag.
 */
export const HASHTAG_RE = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_]+)/g;

/** Every hashtag in a review, in order, without the leading '#'. */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(HASHTAG_RE)].map((m) => m[2]);
}

/** The Postgres SQLSTATEs this client can actually meet, by name. */
export const PG = {
  /** Unique violation: a duplicate ranking, handle, category name, or top-four slot. */
  duplicate: '23505',
  /** Check violation: a handle's charset, a score's half-star step, a top-four slot out of 1–4. */
  checkViolation: '23514',
  /** RLS refused the row: signed out, session expired, or a banned account. */
  rlsDenied: '42501',
  /** `raise exception` from one of our own functions — those messages are written for people. */
  raised: 'P0001',
} as const;

export type WriteError = { code?: string; message: string };

/**
 * What a rejected write says to the person who made it.
 *
 * The rule this exists to enforce: **a Postgres message never reaches a user.**
 * Every write used to end `: error.message`, which was fine while every failure
 * anyone had thought of was mapped — and then the one-ranking-per-food index
 * landed and a user was shown `duplicate key value violates unique constraint
 * "rankings_one_per_food_idx"`. Mapping that one string fixes that one string;
 * the next constraint would have done it again. So the fallback is now a plain
 * sentence, and the raw text goes to the console for whoever is debugging.
 *
 * `known` maps a SQLSTATE to the specific sentence for this particular write —
 * "you've already ranked that here" reads very differently from "that handle is
 * taken", and both are 23505.
 */
export function writeError(error: WriteError, known: Record<string, string> = {}): string {
  const code = error.code ?? '';
  if (known[code]) return known[code];
  if (code === PG.rlsDenied) {
    return "That didn't go through — you're either signed out or this account can't post any more.";
  }
  if (code === PG.raised) return error.message;
  return "That didn't go through. Try again in a moment.";
}

/** The four top-four slots, in display order. */
export const TOP_SLOTS = [1, 2, 3, 4] as const;

/**
 * The slot a newly pinned ranking takes: the lowest free one, or null when all
 * four are held.
 *
 * Lowest-free rather than "next after the highest" because unpinning leaves a
 * hole — pin four, unpin the second, and counting from the top would ask for
 * slot 5, which the check constraint refuses. The DB has the final say either
 * way (one ranking per slot per person, partial unique index), so a race
 * between two tabs loses one write rather than double-filling a slot.
 */
export function nextTopSlot(taken: readonly (number | null)[]): number | null {
  const held = new Set(taken);
  return TOP_SLOTS.find((slot) => !held.has(slot)) ?? null;
}
