/**
 * What has shipped to the site, newest first.
 *
 * This file is the single source of truth for the version: the footer shows
 * `releases[0].version`. Adding a release means putting a new entry at the top
 * and bumping `package.json`'s version to match — nothing derives one from the
 * other, so they drift silently if you only do one.
 *
 * Notes are user-facing copy and follow docs/writing/voice.md: plain sentences,
 * the site's own vocabulary (ranking, category, handle, loved it), no
 * exclamation points. Changes nobody outside the repo can see — docs, deploy
 * plumbing, refactors — don't belong here.
 */
export type Release = {
  version: string;
  /** ISO date the release went live. */
  date: string;
  notes: string[];
};

export const releases: Release[] = [
  {
    version: '0.4.0',
    date: '2026-07-24',
    notes: [
      'The site reads properly on a phone. Rankings, category rows and feed headlines wrap instead of getting cut off, and the controls that used to need a hover are always visible on touch.',
      'The board is wider on desktop, so more of each activity headline survives.',
      'The sign-in card now says outright that it can sign you in, and what happens if we have never seen your address before.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-07-24',
    notes: [
      'Rankings can carry a short review. Write a #hashtag in one and it becomes a link — every review sharing that tag lives at its own page.',
      'Every category has a page of its own, linked from anywhere its name appears.',
      'You can rename your own handle from your profile.',
      'Categories sort A to Z as well as by average.',
      'Admins can rename a category or merge two that mean the same thing.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-07-23',
    notes: [
      'Profile pages: everything one person has ranked, with their averages, at their own address.',
      'Pick a flair tag for your profile — Peloton, Zwift or Runner, one at a time.',
      'The lunchbox-and-star mark arrives, in the header and the tab.',
      'Admins can ban a profile that is only here to make a mess.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-23',
    notes: [
      'Lunchboxd opens. Invent a category, score what you eat out of five stars, and watch the global average move.',
      'Mark a ranking as loved it, independent of the score.',
      'Claim a handle as a guest, or sign in by email and keep it for good.',
    ],
  },
];

/** The version the site is running — what the footer shows. */
export const version = releases[0].version;
