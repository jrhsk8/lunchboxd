# Glossary — the words this project uses

One word per concept, binding on every surface: comments, docs, commit messages, ticket bodies, and identifiers. Ruled 2026-07-26 against what the code and docs already said. [voice.md](voice.md) governs how user-facing strings _sound_; the terms below are what they must _call things_, there and everywhere else.

## The terms

| Term                        | Means                                                                                                                    | Kills                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **ranking**                 | One person scoring one food out of five under one category. The unit of the whole product.                               | "review" for the act, "rating", "entry", "log" as a noun            |
| **score**                   | The number out of five on a ranking.                                                                                     | "rating", "stars" — the component is `Stars`, the value is a score  |
| **review**                  | The optional text a ranking carries. A ranking may have one; it is never the ranking itself.                             | "comment", "note", "caption"                                        |
| **category**                | The communal namespace a ranking sits under. Categories are **invented**, not created.                                   | "list", "topic", "tag"                                              |
| **food**                    | What was eaten.                                                                                                          | "item", "dish", "entry"                                             |
| **eater**                   | A person who has ranked at least once — the membership rule the Eaters tab enforces.                                     | "user", in prose, always                                            |
| **person**                  | A human, where eater is too narrow: a signed-out visitor, a guest, a signup that never ranked.                           | "user"                                                              |
| **profile**                 | A person's page, and their row.                                                                                          | "account" for the page                                              |
| **handle**                  | The name a person picks. A guest gets a **serial handle** (`guest-4f2a1`) instead, and an email is what buys a real one. | "username" in prose, "display name", "nickname"                     |
| **loved it** / **heart**    | The author's own score-independent mark on their own ranking.                                                            | "favourite", and "like" for this mark                               |
| **like**                    | What _another_ person gives a ranking. Email accounts only, one per person, cleared by an edit.                          | "heart" for this mark, "upvote", "fave"                             |
| **calling card** (**card**) | The three-stat panel a person composes about themselves.                                                                 | "profile card", "badge", "widget"                                   |
| **slot**                    | One of the card's three stat positions. The first is the **hero**.                                                       | "field", "stat box"                                                 |
| **accent**                  | The Supporter-gated card colour.                                                                                         | "theme", "tint"                                                     |
| **studio**                  | The editor that picks slots and accent.                                                                                  | "editor", "settings", "picker" — the `select` inside it is a picker |
| **top four**                | The up-to-four rankings a person **pins** to their profile.                                                              | "favourites", "featured", "showcase"                                |
| **board**                   | The site's home surface and its three tabs — categories, activity, eaters.                                               | "home", "dashboard", "landing"                                      |
| **feed**                    | A reverse-chronological list of rankings, wherever it appears.                                                           | "stream", "timeline", "history"                                     |
| **tag**                     | Flair on a profile: supporter, admin, runner, peloton.                                                                   | "badge", "role", "flair" as a noun                                  |
| **notification**            | A told-you-about-it row, owned by the like that caused it.                                                               | "alert", "ping", "inbox item"                                       |
| **guest**                   | An anonymous session with a serial handle.                                                                               | "anon", "temp user"                                                 |
| **supporter**               | Someone carrying the supporter tag.                                                                                      | "subscriber", "patron", "premium"                                   |

## The collisions that matter

**ranking / review / rating.** A ranking is the act and the row; a review is the text on it; **rating is banned entirely**, because the number is a score. So `rankings.review` is the text, and `review_count` counts rankings that carry text — both correct.

**loved it / like.** Two marks with two owners: the heart is yours on your own ranking, the like is somebody else's on yours. The UI already refuses to blur them — the like control carries no glyph precisely because the gold heart owns that shape. See `decisions.md` 2026-07-25.

**eater / person / user.** _User_ is dead in prose. **Eater** where the person has ranked, **person** where they may not have. A signup that never ranked is a person with a profile, not an eater — which is exactly why the `eaters` view filters on `ranking_count > 0`.

**board / feed / activity.** All three survive because they name different things: the board is the surface, activity is one of its tabs, and the feed is the list of rankings that tab renders.

## How far it binds identifiers

Prose absolutely. Identifiers too, with two exceptions:

1. **Third-party names pass through untouched.** `auth.users` is Supabase's, so `user_id` as the foreign key naming that row is correct and stays. Same for React prop names, Postgres built-ins and Supabase client methods. The exception covers the name being _referenced_, not our own names sitting beside it.
2. **Generated files are exempt.** `src/database.types.ts` is regenerated by `npm run types` and moves only when the schema does. Correct it by renaming the schema, never by hand.

Where a term is two words, the identifier uses the natural single-word form — `card`, `slot`, `accent` — not a contraction of the phrase.

## Known contradictions

Live, deliberate, and each judged rather than fixed by reflex:

- **`profiles.username` vs handle.** The prose word is handle everywhere. The column keeps its name: it is depended on by the `eaters` and `profile_card_stats` views, a citext unique index, a column-scoped update grant, a before-update trigger and the generated types, and renaming it buys a production migration to make one word agree with itself.
- **`categories.created_by` / `created_at` vs _invented_.** Same reasoning at lower stakes; `created_at` is a house-wide timestamp convention, and splitting the two would leave one table odd.
- **`notifications.actor_id`.** _Actor_ is a word this project uses nowhere else. It stays because the column is deliberately generic — `kind` is a one-value check today with follows and reports in mind, and those have actors who are not likers.
- **`rankings.hearted`.** Not a contradiction: **heart** is the glossary's noun for the loved-it mark.
