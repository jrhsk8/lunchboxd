/**
 * The pure text/time helpers, kept apart from ui.tsx because a rule deserves a
 * home of its own: everything here is a decision with edge cases — a boundary,
 * a fallback, a message somebody reads — and each one is pinned by a test in
 * text.test.ts rather than inferred from the component that calls it.
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
 * the leading boundary char (kept as text), group 2 is the hashtag. No lookbehind,
 * for older-Safari safety.
 *
 * These boundary rules are duplicated by `useHashtagReviews`, which refines the
 * database's substring prefilter with the same word boundary; both are covered
 * by `src/text.test.ts`, because a drift between them shows up as a hashtag page
 * listing reviews that don't carry the hashtag.
 */
export const HASHTAG_RE = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_]+)/g;

/** Every hashtag in a review, in order, without the leading '#'. */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(HASHTAG_RE)].map((m) => m[2]);
}

/**
 * A hashtag from the route, reduced to what a hashtag may contain: lower case,
 * and nothing outside HASHTAG_RE's character class. The hash is hand-editable,
 * so "#/t/Pizza!" and "#/t/pizza" have to name the same page.
 *
 * Lives here beside the pattern it has to agree with — the two were written
 * separately in `HashtagPage` and in `useHashtagReviews`, which meant the page
 * cleaned a value and then handed it to a hook that cleaned it again (#88).
 */
export function cleanHashtag(hashtag: string): string {
  return hashtag.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/**
 * The word to use for a count: `one` at exactly one, `many` everywhere else —
 * zero included, which is the case the inline ternaries kept getting right by
 * accident.
 *
 * Both words are spelled out rather than an 's' being appended, because the
 * site's plurals include person/people and category/categories, and a helper
 * that only handles the easy half sends half the call sites back to writing
 * their own (#87).
 */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
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
 * The rule this exists to enforce: **a Postgres message never reaches a person.**
 * Every write used to end `: error.message`, which was fine while every failure
 * anyone had thought of was mapped — and then the one-ranking-per-food index
 * landed and somebody was shown `duplicate key value violates unique constraint
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

/** Every page the hash can name. */
export type Route =
  | { page: 'home' }
  | { page: 'profile'; username: string }
  | { page: 'category'; name: string }
  | { page: 'hashtag'; hashtag: string }
  | { page: 'notifications' }
  | { page: 'terms' };

/**
 * One hash, one route. Pure, so every rule below is testable.
 *
 * Anything unrecognised is home, deliberately and silently: the fragment is
 * also where Supabase delivers a magic link (`#access_token=…`), so a parse
 * that threw or that showed a "no such page" would fire on a successful
 * sign-in. Malformed percent-encoding in a hand-typed URL goes the same way.
 */
export function parseHash(hash: string): Route {
  if (hash === '#/terms') return { page: 'terms' };
  if (hash === '#/notifications') return { page: 'notifications' };
  const m = /^#\/([uct])\/(.+)$/.exec(hash);
  if (m) {
    try {
      const value = decodeURIComponent(m[2]);
      if (m[1] === 'u') return { page: 'profile', username: value };
      if (m[1] === 'c') return { page: 'category', name: value };
      return { page: 'hashtag', hashtag: value };
    } catch {
      // Malformed percent-encoding: fall through to home.
    }
  }
  return { page: 'home' };
}
