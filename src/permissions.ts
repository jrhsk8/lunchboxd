/**
 * What the site offers a viewer, as pure predicates.
 *
 * **These decide what is shown, never what is allowed.** Every rule here is
 * enforced server-side — RLS on the tables, `ban_profile` and `delete_category`
 * as SECURITY DEFINER functions — and this file exists so the client stops
 * re-deriving the same conditions inline at each control. Showing somebody a
 * destructive button they can't use is the failure this prevents; letting them
 * through is not a failure it could cause.
 *
 * React-free so each rule is pinned by a test, the same reason `tags.ts` and
 * `calling-card.ts` are.
 */

/** What the viewer is, for every control that offers different things to each. */
export type ViewerKind = 'out' | 'guest' | 'email';

/**
 * Signed out, eating as a guest, or holding an email — the one place the JWT's
 * `is_anonymous` claim is read.
 *
 * **The claim goes stale in one direction**: it stays true until the session
 * refreshes after an email is confirmed, so a just-confirmed account can be
 * offered the invitation it no longer needs. Harmless that way round — the
 * insert policy calls `caller_has_email()` over `auth.users` and lets them
 * through, and a confirmation link lands with a fresh session anyway. Never
 * invert it to *grant* something on the claim (#90).
 *
 * Takes the session structurally rather than importing supabase-js, so this
 * module stays free of the client and its rules stay testable.
 */
export function viewerKind(session: { user: { is_anonymous?: boolean } } | null): ViewerKind {
  if (!session) return 'out';
  return session.user.is_anonymous ? 'guest' : 'email';
}

/** A profile, as far as deciding what its page offers is concerned. */
export type ProfileSubject = {
  id: string;
  is_admin: boolean;
  banned_at: string | null;
};

/** The viewer, as far as any of these decisions go. */
export type Viewer = {
  userId: string | null;
  isAdmin: boolean;
  /** 'guest' while the session is anonymous. See {@link viewerKind} in ui.tsx. */
  isGuest: boolean;
};

/** Their own page. */
export function isOwnProfile(viewer: Viewer, profile: ProfileSubject): boolean {
  return viewer.userId !== null && viewer.userId === profile.id;
}

/**
 * Whether the owner's controls appear: the rename box, the flair picker, the
 * studio and the pins.
 *
 * A banned profile keeps its session and its page, and every write it makes is
 * refused by the insert policies — so its own controls come down rather than
 * failing one at a time under the finger.
 */
export function mayEditOwnProfile(viewer: Viewer, profile: ProfileSubject): boolean {
  return isOwnProfile(viewer, profile) && profile.banned_at === null;
}

/**
 * Whether the ban button appears.
 *
 * Admins only, never on your own profile, and never on another admin's — both
 * refusals are `ban_profile`'s own, checked here so the button isn't offered
 * for a click that would be turned away.
 */
export function mayBan(viewer: Viewer, profile: ProfileSubject): boolean {
  return viewer.isAdmin && !isOwnProfile(viewer, profile) && !profile.is_admin;
}

/** A category, as far as deciding who may delete it is concerned. */
export type CategorySubject = {
  created_by: string | null;
  ranker_count: number;
};

/**
 * Who is offered the tools on a category, and under which heading: an admin
 * always, the person who invented it only while nobody else has ranked there.
 *
 * The `ranker_count <= 1` is the whole rule and the easy half to get wrong —
 * it is "nobody but you", not "nobody", because the inventor has usually
 * ranked in their own category. `delete_category` enforces the same condition
 * and raises a sentence when it doesn't hold.
 */
export function categoryToolsFor(
  category: CategorySubject,
  viewer: Viewer,
): 'admin' | 'inventor' | null {
  if (viewer.isAdmin) return 'admin';
  if (viewer.userId && category.created_by === viewer.userId && category.ranker_count <= 1) {
    return 'inventor';
  }
  return null;
}
