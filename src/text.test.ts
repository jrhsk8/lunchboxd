import { describe, expect, it } from 'vitest';

// Imported from text.ts, where these rules live on purpose: each is a decision
// with edge cases, and a test is what keeps the decision from drifting.
import {
  cleanHashtag,
  hashtagsIn,
  nextTopSlot,
  parseHash,
  PG,
  plural,
  reviewPieces,
  timeAgo,
  writeError,
} from './text';

/*
 * The pure functions worth pinning: each has boundary rules subtle enough to
 * regress silently, and none of them need a DOM.
 */

describe('hashtag matching', () => {
  // These rules are shared with the server-side prefilter in useHashtagReviews —
  // the DB does `ilike %#tag%` and the client refines with the same boundary,
  // so if one drifts the tag page shows rows the other wouldn't.
  it('finds a plain hashtag', () => {
    expect(hashtagsIn('still a #classic')).toEqual(['classic']);
  });

  it('finds one at the very start', () => {
    expect(hashtagsIn('#classic, honestly')).toEqual(['classic']);
  });

  it('finds several', () => {
    expect(hashtagsIn('#cold #sad #ate')).toEqual(['cold', 'sad', 'ate']);
  });

  it('ignores a # glued to a preceding word character', () => {
    expect(hashtagsIn('a#b')).toEqual([]);
    expect(hashtagsIn('http://x.com/page#frag')).toEqual([]);
  });

  it('takes the whole run of word characters', () => {
    // The reason "#tag" must not match a review containing "#tagged": the tag
    // page filters on the full token, not a prefix.
    expect(hashtagsIn('#tagged')).toEqual(['tagged']);
  });

  it('stops at punctuation', () => {
    expect(hashtagsIn('#classic.')).toEqual(['classic']);
    expect(hashtagsIn('#classic, #again')).toEqual(['classic', 'again']);
  });

  it('allows underscores and digits, not hyphens', () => {
    expect(hashtagsIn('#pad_thai2')).toEqual(['pad_thai2']);
    expect(hashtagsIn('#pad-thai')).toEqual(['pad']);
  });

  it('ignores a bare hash', () => {
    expect(hashtagsIn('# ')).toEqual([]);
    expect(hashtagsIn('#')).toEqual([]);
  });
});

describe('cleanHashtag', () => {
  // The route value and HASHTAG_RE have to agree: whatever survives this is
  // what the page titles itself, what the ilike prefilter searches for, and
  // what the boundary regex is built from.
  it('lower-cases, because the hash is hand-editable', () => {
    expect(cleanHashtag('Pizza')).toBe('pizza');
  });

  it('drops everything outside the hashtag character class', () => {
    expect(cleanHashtag('pizza!')).toBe('pizza');
    expect(cleanHashtag('pad-thai')).toBe('padthai');
    expect(cleanHashtag('#pizza')).toBe('pizza');
  });

  it('keeps digits and underscores, which hashtags may contain', () => {
    expect(cleanHashtag('pad_thai2')).toBe('pad_thai2');
  });

  it('cleans a clean value to itself, since the page and the hook both clean', () => {
    expect(cleanHashtag(cleanHashtag('Pad-Thai!'))).toBe(cleanHashtag('Pad-Thai!'));
  });

  it('gives back nothing when nothing survives', () => {
    expect(cleanHashtag('!!!')).toBe('');
    expect(cleanHashtag('')).toBe('');
  });
});

describe('reviewPieces', () => {
  // The half of the hashtag rendering that used to be unreachable from a test:
  // HASHTAG_RE was pinned above, and the index arithmetic that slices a review
  // around its matches sat inside a component. Every case below is a review
  // somebody could write, and getting the arithmetic wrong eats characters of
  // it.
  const text = (pieces: ReturnType<typeof reviewPieces>) =>
    pieces.map((p) => ('hashtag' in p ? `#${p.hashtag}` : p.text)).join('');

  it('gives back plain text unbroken', () => {
    expect(reviewPieces('no hashtags here')).toEqual([{ text: 'no hashtags here' }]);
  });

  it('splits around a hashtag, keeping the space before it', () => {
    expect(reviewPieces('still a #classic')).toEqual([
      { text: 'still a ' },
      { hashtag: 'classic' },
    ]);
  });

  it('handles a hashtag at the very start', () => {
    expect(reviewPieces('#classic, honestly')).toEqual([
      { hashtag: 'classic' },
      { text: ', honestly' },
    ]);
  });

  it('keeps the text between two hashtags', () => {
    expect(reviewPieces('#cold and #sad')).toEqual([
      { hashtag: 'cold' },
      { text: ' and ' },
      { hashtag: 'sad' },
    ]);
  });

  it('treats a glued # as ordinary text', () => {
    expect(reviewPieces('a#b')).toEqual([{ text: 'a#b' }]);
  });

  it('loses nothing, whatever the review says', () => {
    for (const review of [
      'plain',
      '#one',
      'a #one b #two c',
      '#one#two',
      'http://x.com/page#frag and #real',
      '#',
      '',
    ]) {
      expect(text(reviewPieces(review))).toBe(review);
    }
  });
});

describe('plural', () => {
  it('uses the singular at exactly one', () => {
    expect(plural(1, 'ranking', 'rankings')).toBe('ranking');
  });

  it('uses the plural at zero, which is the case worth pinning', () => {
    expect(plural(0, 'ranking', 'rankings')).toBe('rankings');
  });

  it('carries the irregular pairs this site actually uses', () => {
    expect(plural(1, 'person', 'people')).toBe('person');
    expect(plural(3, 'person', 'people')).toBe('people');
    expect(plural(2, 'Category', 'Categories')).toBe('Categories');
  });
});

describe('writeError', () => {
  /*
   * The exact payload the hosted backend returned for a second ranking of the
   * same food, captured from a real anonymous session against production on
   * 2026-07-25. A user was shown this `message` verbatim, which is why this
   * function exists; nothing may ever put a Postgres string in front of a
   * person again. That particular index has since been dropped (repeat logs are
   * allowed now) — the payload stays as the fixture because it is a real one.
   */
  const duplicateRanking = {
    code: '23505',
    details: null,
    hint: null,
    message: 'duplicate key value violates unique constraint "rankings_one_per_food_idx"',
  };

  it('uses the sentence this particular write supplies', () => {
    expect(
      writeError(duplicateRanking, { [PG.duplicate]: "You've already ranked that here." }),
    ).toBe("You've already ranked that here.");
  });

  it('never returns the Postgres text, even for an unmapped code', () => {
    for (const error of [
      duplicateRanking,
      { code: '23514', message: 'new row violates check constraint "rankings_top_rank_range"' },
      { code: '23503', message: 'insert or update violates foreign key constraint' },
      { code: 'PGRST204', message: "Could not find the 'top_rank' column" },
      { code: '', message: 'TypeError: Failed to fetch' },
      { message: 'no code at all' },
    ]) {
      expect(writeError(error)).not.toContain('constraint');
      expect(writeError(error)).not.toBe(error.message);
    }
  });

  it('says what a refused row usually means', () => {
    expect(writeError({ code: PG.rlsDenied, message: 'new row violates row-level security' })).toBe(
      "That didn't go through — you're either signed out or this account can't post any more.",
    );
  });

  it('passes our own raised exceptions through, since those are written for people', () => {
    // delete_category and friends raise sentences, not diagnostics.
    expect(
      writeError({
        code: PG.raised,
        message: 'Only the person who invented this category can delete it.',
      }),
    ).toBe('Only the person who invented this category can delete it.');
  });
});

describe('nextTopSlot', () => {
  it('starts at one', () => {
    expect(nextTopSlot([])).toBe(1);
  });

  it('takes the lowest free slot, not the one after the highest', () => {
    // The reason this isn't max+1: pin four, unpin the second, and counting
    // from the top asks for slot 5, which the check constraint refuses.
    expect(nextTopSlot([1, 3, 4])).toBe(2);
    expect(nextTopSlot([2, 3])).toBe(1);
  });

  it('runs out at four', () => {
    expect(nextTopSlot([1, 2, 3, 4])).toBe(null);
    expect(nextTopSlot([4, 2, 1, 3])).toBe(null);
  });

  it('ignores nulls, which is what an unpinned ranking carries', () => {
    expect(nextTopSlot([null, 1, null])).toBe(2);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-07-25T12:00:00Z').getTime();
  const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now);

  it('reads just now under a minute', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59_000)).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(ago(60_000)).toBe('1m ago');
    expect(ago(3_600_000)).toBe('1h ago');
    expect(ago(86_400_000)).toBe('1d ago');
    expect(ago(29 * 86_400_000)).toBe('29d ago');
  });

  it('switches to an absolute date past a month', () => {
    // The bug this replaced: a two-year-old ranking read "731d ago", in a
    // fixed-width column.
    expect(ago(30 * 86_400_000)).toBe('25 Jun');
    expect(ago(200 * 86_400_000)).toBe('6 Jan');
  });

  it('adds a year once the date is in a previous one', () => {
    expect(ago(400 * 86_400_000)).toBe('20 Jun 25');
    expect(ago(731 * 86_400_000)).toBe('24 Jul 24');
  });

  it('never counts backwards for a clock skewed into the future', () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe('just now');
  });
});

describe('parseHash', () => {
  it('reads the three value routes', () => {
    expect(parseHash('#/u/hotdog_hank')).toEqual({ page: 'profile', username: 'hotdog_hank' });
    expect(parseHash('#/c/Gas Station Sushi')).toEqual({
      page: 'category',
      name: 'Gas Station Sushi',
    });
    expect(parseHash('#/t/brunch')).toEqual({ page: 'hashtag', hashtag: 'brunch' });
  });

  it('reads the two fixed routes, and home', () => {
    expect(parseHash('#/terms')).toEqual({ page: 'terms' });
    expect(parseHash('#/notifications')).toEqual({ page: 'notifications' });
    expect(parseHash('#/')).toEqual({ page: 'home' });
    expect(parseHash('')).toEqual({ page: 'home' });
  });

  it('percent-decodes the value', () => {
    expect(parseHash('#/c/Soup%2DAdjacent')).toEqual({ page: 'category', name: 'Soup-Adjacent' });
    expect(parseHash('#/u/j%20h')).toEqual({ page: 'profile', username: 'j h' });
  });

  it('falls through to home on malformed encoding rather than throwing', () => {
    // A hand-typed URL, and the reason the parse catches at all.
    expect(parseHash('#/c/%E0%A4%A')).toEqual({ page: 'home' });
  });

  it("never claims a route from Supabase's magic-link fragment", () => {
    // The whole reason routing is hash-based here is that it must coexist with
    // this: a sign-in landing must render home, not a category called
    // "access_token=...".
    expect(parseHash('#access_token=abc123&refresh_token=def&type=magiclink')).toEqual({
      page: 'home',
    });
    expect(parseHash('#error=access_denied&error_description=expired')).toEqual({ page: 'home' });
  });

  it('keeps an unknown single-letter route out', () => {
    expect(parseHash('#/x/whatever')).toEqual({ page: 'home' });
    expect(parseHash('#/u/')).toEqual({ page: 'home' });
  });
});
