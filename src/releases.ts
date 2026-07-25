/**
 * What has shipped to the site, newest first.
 *
 * Nothing renders this any more: the footer's version button and its What's-new
 * dialog were removed on owner's ruling that the version is a detail for him,
 * not for visitors. The file stays as the changelog of record — the single
 * source of truth for the version, kept in step with `package.json` by hand,
 * since nothing derives one from the other.
 *
 * Notes read as user-facing copy and follow docs/writing/voice.md: plain
 * sentences, the site's own vocabulary (ranking, category, handle, loved it),
 * no exclamation points. Changes nobody outside the repo can see — docs, deploy
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
    version: '0.7.0',
    date: '2026-07-25',
    notes: [
      "You can like somebody else's ranking. The heart is unchanged — that's still the author's own mark on their own food — and the like is the one everyone else gives. It needs an email on your account, so if you're eating as a guest, use \"Keep account\" first. Editing a ranking clears the likes it had: they were for what it used to say.",
      'Your profile has a calling card — your handle and three stats you pick from fourteen. Open the studio on your own profile to choose them. Supporters can pick a colour for theirs.',
      'A third tab, Eaters: everybody who has ranked something, as their calling card. Sort by who ate most recently, who has ranked the most, who has the most likes, or A–Z.',
      'The bell in the header lights up when somebody likes one of your rankings, and the notifications page keeps the list. Nobody is emailed about any of this — the address you signed in with is still only used to sign you in.',
      'Guests eat under a serial number now — guest-4f2a1 and the like. Add an email whenever you want and you can pick a handle that survives a new browser, which the old guest names could not.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-07-25',
    notes: [
      'Your profile has a top four. Pin up to four of your rankings with the ◇ next to them and they sit at the top of your profile for everyone to see, Letterboxd-style. Click the ✕ on a card to take one out.',
      'A category can be deleted outright now. Admins can delete any of them; if you invented one and nobody else has ranked in it yet, you can delete your own. Everything ranked in it goes too, so it asks first.',
      'Some handles now wear a Supporter badge. It goes to the people who have chipped in to keep the site running, and it sits next to whatever flair they already had.',
      'You can log the same food more than once. Yesterday the site allowed one ranking per food per category and refused the rest, which is no good if you have four of the same thing in a day — so log each one, up to ten a day. Two in the same minute at the same score still reads as a slip of the thumb and is turned away.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-07-25',
    notes: [
      'You can edit a ranking now. Fix a typo, change the score, add the review you forgot — the ranking keeps its place and its heart instead of having to be deleted and logged again.',
      'Handles no longer care about capitals. "Jack" and "jack" are the same person, links to a profile work whichever way you type it, and nobody can sign up as a near-copy of someone else. A few handles with spaces or punctuation were tidied to fit the new rule.',
      'Category averages are one score per person per food, and the Top rated board no longer puts a brand-new category with a single five-star ranking above one that fifty people agree on.',
      'Long reviews have a "more" link, so a review written on a phone can be read on one.',
      'Picking a category is one field with type-ahead: start typing to join a category that exists, or keep going to invent one.',
      'Deleting a ranking asks first, and says which one.',
      'When something goes wrong loading the site, it now says so instead of showing an empty board as though nobody had ranked anything.',
      'The terms of service has its own page you can link to, and the typeface is served from this site rather than Google — the terms say we do not hand your data to anyone, and that now includes loading a font.',
      'Scoring works with a keyboard, the stars are bigger and easier to hit on a phone, and screen readers announce scores and the board tabs properly.',
    ],
  },
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
