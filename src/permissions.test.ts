import { describe, expect, it } from 'vitest';

import {
  categoryToolsFor,
  isOwnProfile,
  mayBan,
  mayEditOwnProfile,
  viewerKind,
  type CategorySubject,
  type ProfileSubject,
  type Viewer,
} from './permissions';

/*
 * These decide what a person is offered, not what they may do — the server
 * enforces all of it. The failure worth pinning is showing somebody a
 * destructive control that would be refused, which is a bug they experience as
 * the site being broken.
 */

const ME = 'me-id';
const THEM = 'them-id';

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  userId: ME,
  isAdmin: false,
  isGuest: false,
  ...over,
});

const profile = (over: Partial<ProfileSubject> = {}): ProfileSubject => ({
  id: ME,
  is_admin: false,
  banned_at: null,
  ...over,
});

const category = (over: Partial<CategorySubject> = {}): CategorySubject => ({
  created_by: ME,
  ranker_count: 1,
  ...over,
});

describe('isOwnProfile', () => {
  it('is true only for your own', () => {
    expect(isOwnProfile(viewer(), profile())).toBe(true);
    expect(isOwnProfile(viewer(), profile({ id: THEM }))).toBe(false);
  });

  it('is false when signed out, rather than matching a null id', () => {
    expect(isOwnProfile(viewer({ userId: null }), profile({ id: ME }))).toBe(false);
  });
});

describe('mayEditOwnProfile', () => {
  it('offers the owner their controls', () => {
    expect(mayEditOwnProfile(viewer(), profile())).toBe(true);
  });

  it('takes them away once banned, rather than letting each write fail', () => {
    expect(mayEditOwnProfile(viewer(), profile({ banned_at: '2026-07-25T00:00:00Z' }))).toBe(false);
  });

  it('never offers them on a page that is not yours', () => {
    expect(mayEditOwnProfile(viewer(), profile({ id: THEM }))).toBe(false);
  });
});

describe('mayBan', () => {
  it('is for admins, on other people', () => {
    expect(mayBan(viewer({ isAdmin: true }), profile({ id: THEM }))).toBe(true);
  });

  it('is never offered to a non-admin', () => {
    expect(mayBan(viewer(), profile({ id: THEM }))).toBe(false);
  });

  it('refuses self-bans and admin targets, as ban_profile does', () => {
    expect(mayBan(viewer({ isAdmin: true }), profile({ id: ME }))).toBe(false);
    expect(mayBan(viewer({ isAdmin: true }), profile({ id: THEM, is_admin: true }))).toBe(false);
  });
});

describe('categoryToolsFor', () => {
  it('gives an admin the tools in any category', () => {
    expect(
      categoryToolsFor(category({ created_by: THEM, ranker_count: 40 }), viewer({ isAdmin: true })),
    ).toBe('admin');
  });

  it('gives the inventor the tools while they are the only ranker', () => {
    expect(categoryToolsFor(category({ ranker_count: 1 }), viewer())).toBe('inventor');
    // Nobody has ranked at all yet, which is still nobody but them.
    expect(categoryToolsFor(category({ ranker_count: 0 }), viewer())).toBe('inventor');
  });

  it('takes them away the moment somebody else ranks there', () => {
    expect(categoryToolsFor(category({ ranker_count: 2 }), viewer())).toBe(null);
  });

  it('offers nothing to a stranger or to a signed-out visitor', () => {
    expect(categoryToolsFor(category({ created_by: THEM }), viewer())).toBe(null);
    expect(categoryToolsFor(category({ created_by: null }), viewer({ userId: null }))).toBe(null);
  });
});

describe('viewerKind', () => {
  it('reads the three states off the session', () => {
    expect(viewerKind(null)).toBe('out');
    expect(viewerKind({ user: { is_anonymous: true } })).toBe('guest');
    expect(viewerKind({ user: { is_anonymous: false } })).toBe('email');
  });

  it('treats a missing claim as an email account, not a guest', () => {
    // The claim is absent on an ordinary email session; reading it as a guest
    // would offer "Keep account" to somebody who already has one.
    expect(viewerKind({ user: {} })).toBe('email');
  });
});
