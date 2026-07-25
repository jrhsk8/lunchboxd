import { describe, expect, it } from 'vitest';

import {
  cardStatsFrom,
  CARD_STAT_GROUPS,
  CARD_STAT_KEYS,
  CARD_STAT_LABELS,
  cardTrio,
  DEFAULT_TRIO,
  isCardStatKey,
  resolveAccent,
  resolveSlot,
  type CardStats,
} from './calling-card';

/*
 * The card's rules, pinned. Every one of these is a place where a stored value,
 * a missing value, or a lapsed badge decides what a stranger sees on somebody's
 * profile, and none of them need a DOM.
 */

const FULL: CardStats = {
  likesReceived: 12,
  likesGiven: 4,
  heartsGiven: 7,
  rankings: 28,
  reviews: 19,
  categories: 20,
  invented: 3,
  average: 3.4523,
  best: { name: 'Black coffee', value: 5 },
  worst: { name: 'Airport sandwich', value: 1 },
  topCategory: { name: 'Boneless Wings', value: 3 },
  kindest: { name: 'Soda', value: 4.25 },
  harshest: { name: 'Salad', value: 2 },
  since: '2026-07-01T12:00:00Z',
};

/** Somebody who signed up and has done nothing at all. */
const EMPTY: CardStats = {
  likesReceived: 0,
  likesGiven: 0,
  heartsGiven: 0,
  rankings: 0,
  reviews: 0,
  categories: 0,
  invented: 0,
  average: null,
  best: null,
  worst: null,
  topCategory: null,
  kindest: null,
  harshest: null,
  since: null,
};

describe('the stored trio', () => {
  it('falls back to the default when nothing is stored', () => {
    // This is the case that matters most: nearly every card on the site.
    expect(cardTrio(null)).toEqual([...DEFAULT_TRIO]);
    expect(cardTrio([])).toEqual([...DEFAULT_TRIO]);
    expect(cardTrio([null, null, null])).toEqual([...DEFAULT_TRIO]);
  });

  it('uses a stored trio verbatim', () => {
    expect(cardTrio(['likes.received', 'reviews.count', 'eating.since'])).toEqual([
      'likes.received',
      'reviews.count',
      'eating.since',
    ]);
  });

  it('replaces an unknown key with the default for that position, not a blank', () => {
    // A stale pick or a hand-edited row must not render an empty slot.
    expect(cardTrio(['likes.received', 'solo.maxouts', null])).toEqual([
      'likes.received',
      DEFAULT_TRIO[1],
      DEFAULT_TRIO[2],
    ]);
  });

  it('treats a junk lead slot as no choice at all', () => {
    expect(cardTrio(['nonsense', 'reviews.count', 'eating.since'])).toEqual([...DEFAULT_TRIO]);
  });

  it('the default trio is itself in the vocabulary', () => {
    for (const key of DEFAULT_TRIO) expect(isCardStatKey(key)).toBe(true);
  });

  it('every key has a picker label, and none of them is a dash', () => {
    // The picker's labels can't come from resolveSlot: those are written
    // against real numbers and collapse to "—" with no data, which would have
    // listed five stats all called the same thing.
    for (const key of CARD_STAT_KEYS) {
      expect(CARD_STAT_LABELS[key]).toBeTruthy();
      expect(CARD_STAT_LABELS[key]).not.toBe('—');
    }
  });

  it('every key appears in exactly one picker group', () => {
    const grouped = CARD_STAT_GROUPS.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual([...CARD_STAT_KEYS].sort());
  });
});

describe('resolving a slot', () => {
  it('renders counters with their captions', () => {
    expect(resolveSlot('likes.received', FULL)).toEqual({ value: '12', label: 'likes received' });
    expect(resolveSlot('rankings.count', FULL)).toEqual({ value: '28', label: 'rankings' });
  });

  it('renders the average to two places', () => {
    expect(resolveSlot('score.average', FULL)).toEqual({
      value: '3.45',
      label: 'lifetime average',
    });
  });

  it('renders a named stat as the name, with its number in the caption', () => {
    expect(resolveSlot('score.highest', FULL)).toEqual({
      value: 'Black coffee',
      label: 'highest rated, 5.0',
    });
    expect(resolveSlot('category.kindest', FULL)).toEqual({
      value: 'Soda',
      label: 'kindest to, 4.25 average',
    });
  });

  it('pluralises the most-ranked caption', () => {
    expect(resolveSlot('category.most', FULL).label).toBe('most ranked, 3 rankings');
    expect(
      resolveSlot('category.most', { ...FULL, topCategory: { name: 'Soup', value: 1 } }).label,
    ).toBe('most ranked, 1 ranking');
  });

  it('shows a dash rather than a zero where there is no data', () => {
    // An absent average is not an average of nought, and a card that says 0.00
    // to a brand-new eater is stating something false.
    expect(resolveSlot('score.average', EMPTY).value).toBe('—');
    expect(resolveSlot('score.highest', EMPTY).value).toBe('—');
    expect(resolveSlot('category.most', EMPTY).value).toBe('—');
    expect(resolveSlot('eating.since', EMPTY).value).toBe('—');
  });

  it('still counts a real zero as a zero', () => {
    // Nought likes is a fact; nought average is an absence. They render apart.
    expect(resolveSlot('likes.received', EMPTY).value).toBe('0');
  });

  it('resolves every key in the vocabulary, for full and empty stats alike', () => {
    for (const key of CARD_STAT_KEYS) {
      for (const stats of [FULL, EMPTY]) {
        const slot = resolveSlot(key, stats);
        expect(typeof slot.value).toBe('string');
        expect(slot.value.length).toBeGreaterThan(0);
        expect(slot.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the accent', () => {
  it('applies only while the Supporter badge holds', () => {
    expect(resolveAccent('teal', true)).toBe('teal');
    expect(resolveAccent('teal', false)).toBe(null);
  });

  it('drops a swatch that is not in the roster', () => {
    expect(resolveAccent('hotpink', true)).toBe(null);
    expect(resolveAccent(null, true)).toBe(null);
  });
});

describe('cardStatsFrom', () => {
  /** Every column null, which is what a brand-new profile's row looks like. */
  const empty = {
    created_at: null,
    ranking_count: null,
    review_count: null,
    category_count: null,
    hearts_given: null,
    avg_score: null,
    invented_count: null,
    likes_received: null,
    likes_given: null,
    best_food: null,
    best_score: null,
    worst_food: null,
    worst_score: null,
    top_category: null,
    top_category_count: null,
    kindest_category: null,
    kindest_score: null,
    harshest_category: null,
    harshest_score: null,
  };

  it('reads counters as zero and the average as absent', () => {
    // The rule the whole card rests on: a dash is never a zero. No rankings
    // yet is nought rankings; no average yet is not an average of nought.
    const stats = cardStatsFrom(empty);
    expect(stats.rankings).toBe(0);
    expect(stats.likesReceived).toBe(0);
    expect(stats.average).toBeNull();
    expect(stats.since).toBeNull();
  });

  it('coerces the numerics Postgres sends over as strings', () => {
    // numeric arrives as a string through PostgREST, and a card that added 1
    // to it would render "4.251".
    const stats = cardStatsFrom({
      ...empty,
      avg_score: '4.25',
      best_food: 'Pizza',
      best_score: '5',
    });
    expect(stats.average).toBe(4.25);
    expect(stats.best).toEqual({ name: 'Pizza', value: 5 });
  });

  it('drops a named stat that is missing either half', () => {
    // A name with no score is a bug, not an absence, and rendering it as a
    // dash is how it would stay one.
    expect(cardStatsFrom({ ...empty, kindest_category: 'Soup' }).kindest).toBeNull();
    expect(cardStatsFrom({ ...empty, kindest_score: 4.5 }).kindest).toBeNull();
    expect(
      cardStatsFrom({ ...empty, kindest_category: 'Soup', kindest_score: 4.5 }).kindest,
    ).toEqual({ name: 'Soup', value: 4.5 });
  });

  it('keeps a zero apart from an absence on a named stat', () => {
    // top_category_count of 0 is a real number, not a missing half.
    expect(
      cardStatsFrom({ ...empty, top_category: 'Toast', top_category_count: 0 }).topCategory,
    ).toEqual({ name: 'Toast', value: 0 });
  });

  it('maps every key of a fully populated row', () => {
    const stats = cardStatsFrom({
      created_at: '2026-07-01T00:00:00Z',
      ranking_count: 12,
      review_count: 4,
      category_count: 5,
      hearts_given: 3,
      avg_score: 3.75,
      invented_count: 2,
      likes_received: 9,
      likes_given: 7,
      best_food: 'Costco slice',
      best_score: 5,
      worst_food: 'Airport sushi',
      worst_score: 1,
      top_category: 'Pizza',
      top_category_count: 6,
      kindest_category: 'Soup',
      kindest_score: 4.6,
      harshest_category: 'Salad',
      harshest_score: 2.1,
    });
    expect(stats).toEqual({
      likesReceived: 9,
      likesGiven: 7,
      heartsGiven: 3,
      rankings: 12,
      reviews: 4,
      categories: 5,
      invented: 2,
      average: 3.75,
      best: { name: 'Costco slice', value: 5 },
      worst: { name: 'Airport sushi', value: 1 },
      topCategory: { name: 'Pizza', value: 6 },
      kindest: { name: 'Soup', value: 4.6 },
      harshest: { name: 'Salad', value: 2.1 },
      since: '2026-07-01T00:00:00Z',
    });
  });
});
