import { describe, expect, it } from 'vitest';

// Imported from text.ts, not ui.tsx: ui.tsx reaches the Supabase client through
// data.ts, which builds a realtime client at module load and needs a WebSocket.
import { hashtagsIn, timeAgo } from './text';

/*
 * The pure functions worth pinning: each has boundary rules subtle enough to
 * regress silently, and none of them need a DOM.
 */

describe('hashtag matching', () => {
  // These rules are shared with the server-side prefilter in useTagReviews —
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
