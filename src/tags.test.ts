import { describe, expect, it } from 'vitest';

import { profileTags, SELF_TAGS } from './tags';

/*
 * profileTags decides which chips a profile wears, and it is the client half
 * of a security rule rather than a display preference: `tags` is written by
 * the person the chips describe, while `is_admin` and `is_supporter` are
 * granted in SQL and live in their own columns.
 *
 * The rule was written down in a comment and never proven. These tests are the
 * proof, and the forgery case is the one that matters.
 */
describe('profileTags', () => {
  it('renders no chip for a plain profile, and none for nobody', () => {
    expect(profileTags(null)).toEqual([]);
    expect(profileTags({})).toEqual([]);
    expect(profileTags({ tags: [] })).toEqual([]);
  });

  it('puts granted chips before flair', () => {
    expect(profileTags({ is_admin: true, is_supporter: true, tags: ['runner'] })).toEqual([
      'admin',
      'supporter',
      'runner',
    ]);
  });

  it('refuses a granted chip forged in the self-writable column', () => {
    // The whole reason the filter narrows to SELF_TAGS rather than to every
    // known chip: this array is user-supplied, and one dropped check
    // constraint away from carrying exactly these two strings.
    expect(profileTags({ tags: ['supporter'] })).toEqual([]);
    expect(profileTags({ tags: ['admin'] })).toEqual([]);
    expect(profileTags({ tags: ['admin', 'supporter', 'peloton'] })).toEqual(['peloton']);
  });

  it('ignores a string that is not a chip at all', () => {
    expect(profileTags({ tags: ['', 'PELOTON', 'runner ', 'moderator'] })).toEqual([]);
  });

  it('keeps a granted chip that the column does not carry', () => {
    // Granted chips come from their own columns, so a supporter with no flair
    // still wears their badge.
    expect(profileTags({ is_supporter: true })).toEqual(['supporter']);
  });

  it('has a self-serve roster that carries no granted chip', () => {
    // If a granted kind ever enters SELF_TAGS, the filter above stops being a
    // gate — so the roster itself is asserted rather than assumed.
    expect(SELF_TAGS).not.toContain('admin');
    expect(SELF_TAGS).not.toContain('supporter');
  });
});
