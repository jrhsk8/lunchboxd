/**
 * The calling card's pure core: the closed vocabulary of stats a person can put
 * on their card, the rule that turns a stored (or absent) choice into the three
 * stats actually shown, the per-stat value+label rendering, and the
 * Supporter-gated accent.
 *
 * No React and no Supabase import, so the profile header, the Eaters tab and
 * the studio preview all read the same numbers the same way, and every rule is
 * pinned by a test rather than by the component that happens to call it — the
 * same reason `text.ts` and `tags.ts` exist.
 *
 * Ported from maxout.art's `apps/play/src/identity/calling-card.ts`, with one
 * deliberate departure: half of this vocabulary resolves to a **name** rather
 * than a number. maxout's card carries scores in the hundreds of thousands;
 * here the median person has four rankings, so three counters would read
 * "4 / 3 / 0" on most profiles and say nothing. "Pizza — most-ranked category"
 * is the stat that is interesting at four rankings. Ruled in lunchboxd#43.
 */

import { plural } from './text';

/**
 * Every storable stat key. Pinned by a CHECK constraint in
 * `20260725022000_calling_card.sql` — keep the two in lockstep.
 */
export const CARD_STAT_KEYS = [
  'likes.received',
  'likes.given',
  'hearts.given',
  'rankings.count',
  'reviews.count',
  'categories.ranked',
  'categories.invented',
  'score.average',
  'score.highest',
  'score.lowest',
  'category.most',
  'category.kindest',
  'category.harshest',
  'eating.since',
] as const;

export type CardStatKey = (typeof CARD_STAT_KEYS)[number];

export function isCardStatKey(value: unknown): value is CardStatKey {
  return typeof value === 'string' && (CARD_STAT_KEYS as readonly string[]).includes(value);
}

/** The accent swatches, Supporter-only. Also CHECK-pinned. */
export const CARD_ACCENT_KEYS = ['clay', 'teal', 'blue', 'violet', 'gold'] as const;
export type CardAccentKey = (typeof CARD_ACCENT_KEYS)[number];

function isCardAccentKey(value: unknown): value is CardAccentKey {
  return typeof value === 'string' && (CARD_ACCENT_KEYS as readonly string[]).includes(value);
}

/** A named thing with a number attached — the shape the named stats resolve from. */
export type NamedStat = { name: string; value: number } | null;

/**
 * Every number a card might show, mapped out of `profile_card_stats`. Nulls
 * mean "no data yet" and render as a dash rather than a zero: a brand-new
 * profile has no average, which is a different thing from an average of 0.
 */
export interface CardStats {
  likesReceived: number;
  likesGiven: number;
  heartsGiven: number;
  rankings: number;
  reviews: number;
  categories: number;
  invented: number;
  average: number | null;
  /** Highest- and lowest-scored food, by name. */
  best: NamedStat;
  worst: NamedStat;
  /** Most-ranked category, and the two the person is kindest/harshest to. */
  topCategory: NamedStat;
  kindest: NamedStat;
  harshest: NamedStat;
  /** ISO timestamp of when they joined. */
  since: string | null;
}

/** A resolved slot ready to render: the display value and its caption. */
export interface CardSlot {
  value: string;
  label: string;
}

/**
 * What each stat is called in the studio's picker.
 *
 * Separate from the captions `resolveSlot` produces, and necessarily so: a
 * caption is written against real numbers ("kindest to, 4.25 average") and
 * collapses to a dash when there is no data, which would have left the picker
 * listing five stats all named "—".
 */
export const CARD_STAT_LABELS: Record<CardStatKey, string> = {
  'likes.received': 'Likes received',
  'likes.given': 'Likes given',
  'hearts.given': 'Loved it marks',
  'rankings.count': 'Rankings logged',
  'reviews.count': 'Reviews written',
  'categories.ranked': 'Categories eaten in',
  'categories.invented': 'Categories invented',
  'score.average': 'Lifetime average',
  'score.highest': 'Highest-rated food',
  'score.lowest': 'Lowest-rated food',
  'category.most': 'Most-ranked category',
  'category.kindest': 'Kindest to',
  'category.harshest': 'Harshest on',
  'eating.since': 'Eating since',
};

/** The stat keys grouped for the studio's picker, in picker order. */
export const CARD_STAT_GROUPS: readonly { group: string; keys: readonly CardStatKey[] }[] = [
  { group: 'Marks', keys: ['likes.received', 'likes.given', 'hearts.given'] },
  {
    group: 'Volume',
    keys: ['rankings.count', 'reviews.count', 'categories.ranked', 'categories.invented'],
  },
  { group: 'Taste', keys: ['score.average', 'score.highest', 'score.lowest'] },
  { group: 'Places', keys: ['category.most', 'category.kindest', 'category.harshest'] },
  { group: 'Time', keys: ['eating.since'] },
];

/**
 * What a card shows before anyone opens the studio — which is nearly every card
 * on the site, so it matters more than the picker does.
 *
 * Populated for everyone who has ranked anything, and it leads with taste
 * rather than volume. Likes are deliberately NOT the default hero despite being
 * the stat that prompted the feature: a hero number reading 0 on every card
 * teaches people the mark is dead before it has started (lunchboxd#43).
 */
export const DEFAULT_TRIO: readonly [CardStatKey, CardStatKey, CardStatKey] = [
  'score.average',
  'category.most',
  'rankings.count',
];

/**
 * The three stats a card shows, in order. A stored trio is used verbatim; a
 * slot holding an unknown key (a stale pick, a hand-edited row) falls back to
 * the default for *that position* rather than rendering blank.
 */
export function cardTrio(
  slots: readonly (string | null)[] | null,
): [CardStatKey, CardStatKey, CardStatKey] {
  const at = (i: number): CardStatKey | null => (isCardStatKey(slots?.[i]) ? slots[i] : null);
  const first = at(0);
  if (!first) return [...DEFAULT_TRIO] as [CardStatKey, CardStatKey, CardStatKey];
  return [first, at(1) ?? DEFAULT_TRIO[1], at(2) ?? DEFAULT_TRIO[2]];
}

const DASH = '—';

const count = (n: number) => n.toLocaleString();

/** A named stat renders as the name, with its number in the caption. */
function named(stat: NamedStat, caption: (value: number) => string): CardSlot {
  return stat ? { value: stat.name, label: caption(stat.value) } : { value: DASH, label: '—' };
}

/**
 * One stat key against one person's numbers, as a value and its caption.
 *
 * Every caption says what it counts, the way maxout's do: a bare "kindest to"
 * beside a category name is ambiguous about whether it means most-ranked or
 * best-rated, and both are on this card.
 */
export function resolveSlot(key: CardStatKey, stats: CardStats): CardSlot {
  switch (key) {
    case 'likes.received':
      return { value: count(stats.likesReceived), label: 'likes received' };
    case 'likes.given':
      return { value: count(stats.likesGiven), label: 'likes given' };
    case 'hearts.given':
      return { value: count(stats.heartsGiven), label: 'loved it' };
    case 'rankings.count':
      return { value: count(stats.rankings), label: 'rankings' };
    case 'reviews.count':
      return { value: count(stats.reviews), label: 'reviews written' };
    case 'categories.ranked':
      return { value: count(stats.categories), label: 'categories eaten in' };
    case 'categories.invented':
      return { value: count(stats.invented), label: 'categories invented' };
    case 'score.average':
      return {
        value: stats.average === null ? DASH : stats.average.toFixed(2),
        label: 'lifetime average',
      };
    case 'score.highest':
      return named(stats.best, (v) => `highest rated, ${v.toFixed(1)}`);
    case 'score.lowest':
      return named(stats.worst, (v) => `lowest rated, ${v.toFixed(1)}`);
    case 'category.most':
      return named(
        stats.topCategory,
        (v) => `most ranked, ${v} ${plural(v, 'ranking', 'rankings')}`,
      );
    case 'category.kindest':
      return named(stats.kindest, (v) => `kindest to, ${v.toFixed(2)} average`);
    case 'category.harshest':
      return named(stats.harshest, (v) => `harshest on, ${v.toFixed(2)} average`);
    case 'eating.since':
      return {
        value: stats.since
          ? new Date(stats.since).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })
          : DASH,
        label: 'eating since',
      };
  }
}

/** The two badges that decide whether a card may carry a colour. */
export interface AccentBadges {
  isSupporter: boolean;
  isAdmin: boolean;
}

/** Whether this person may choose an accent at all — a supporter or an admin. */
export function mayAccent(badges: AccentBadges): boolean {
  return badges.isSupporter || badges.isAdmin;
}

/**
 * The accent actually applied: the chosen swatch only while a badge that earns
 * it holds, else null (the plain panel ground). Gated here rather than at the
 * write, so a lapsed supporter's card reverts on its own with nothing to clean
 * up — and gets its colour back if the badge returns.
 */
export function resolveAccent(accent: string | null, badges: AccentBadges): CardAccentKey | null {
  if (!mayAccent(badges)) return null;
  return isCardAccentKey(accent) ? accent : null;
}

const ACCENT_TOKENS: Record<CardAccentKey, string> = {
  clay: 'var(--color-clay)',
  teal: 'var(--color-supporter)',
  blue: 'var(--color-peloton)',
  violet: 'var(--color-runner)',
  gold: 'var(--color-gold)',
};

/** The CSS custom-property reference for a swatch, fed to `--card-accent`. */
export function accentToken(accent: CardAccentKey): string {
  return ACCENT_TOKENS[accent];
}

/**
 * The columns `profile_card_stats` exposes, as the client reads them. Both the
 * profile header and the Eaters tab map a row of this shape into `CardStats`
 * through {@link cardStatsFrom} — one mapping, so a card can't say different
 * things about the same person depending on which page drew it.
 */
export type CardStatsRow = {
  created_at: string | null;
  ranking_count: number | null;
  review_count: number | null;
  category_count: number | null;
  hearts_given: number | null;
  avg_score: number | string | null;
  invented_count: number | null;
  likes_received: number | null;
  likes_given: number | null;
  best_food: string | null;
  best_score: number | string | null;
  worst_food: string | null;
  worst_score: number | string | null;
  top_category: string | null;
  top_category_count: number | null;
  kindest_category: string | null;
  kindest_score: number | string | null;
  harshest_category: string | null;
  harshest_score: number | string | null;
};

export function cardStatsFrom(row: CardStatsRow): CardStats {
  // A named stat needs both halves: "kindest category" with a name and no
  // score is not a dash for want of data, it's a bug, and rendering it as a
  // dash is how it would stay one.
  const named = (name: string | null, value: number | string | null) =>
    name === null || value === null ? null : { name, value: Number(value) };
  return {
    likesReceived: Number(row.likes_received ?? 0),
    likesGiven: Number(row.likes_given ?? 0),
    heartsGiven: Number(row.hearts_given ?? 0),
    rankings: Number(row.ranking_count ?? 0),
    reviews: Number(row.review_count ?? 0),
    categories: Number(row.category_count ?? 0),
    invented: Number(row.invented_count ?? 0),
    average: row.avg_score === null ? null : Number(row.avg_score),
    best: named(row.best_food, row.best_score),
    worst: named(row.worst_food, row.worst_score),
    topCategory: named(row.top_category, row.top_category_count),
    kindest: named(row.kindest_category, row.kindest_score),
    harshest: named(row.harshest_category, row.harshest_score),
    since: row.created_at,
  };
}
