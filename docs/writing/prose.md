# Prose — comments, docs, and commit messages

How this repo writes to itself. Three surfaces, one register: a maintainer reading later, who needs the reasoning and already has the code. User-facing strings answer to [voice.md](voice.md) instead, and nothing here overrides it. Ruled 2026-07-26; `src/calling-card.ts` is the worked example for comments and `docs/app/data-model.md` for docs.

## The register

Plain words, full sentences, present tense, stated as fact. Argue where there is room to: name the option not taken and what it would have cost. No hedging, no "obviously", no apologising for the code, and no jokes — `voice.md` owns the jokes and only for visitors. Em-dash asides are house style.

The vocabulary in [glossary.md](glossary.md) binds all three surfaces absolutely.

## Comments

### The earning test

A comment earns its place only by saying something the code cannot. Four kinds qualify, and the list is closed:

1. **The rejected alternative.** The option not taken, and why — "inline under the card rather than a dialog, because the site retired its one modal for a route".
2. **The remote constraint.** A rule enforced somewhere else that this code must stay in lockstep with: a CHECK constraint, an RLS policy, a migration, a generated type. Name the other place.
3. **The counter-intuitive.** Code that looks wrong until you know a fact — the JWT claim being stale after an email is confirmed, a dash that is not a zero.
4. **Orientation.** One file header naming what the file is for and why it exists separately from its neighbours.

Anything else comes out. The failure mode with a name is the **restating comment** — `// the three stats a card shows` above `cardTrio` — which costs a line, ages badly, and teaches the reader to skip comments.

**Density is an outcome, never a target.** No percentage is set. `calling-card.ts` is a third comment because it is a pile of rules; `main.tsx` has none because it mounts an app. Both are correct.

### Form

- `/** */` for the file header and for exported symbols whose why is not obvious. **Not every export** — a self-evident one-liner gets nothing.
- `//` above the code it explains, never trailing at end of line.
- `{/* */}` above the JSX element, same rules.
- Wrapped by hand to the 100-column print width; prettier does not reflow prose.
- Issues as bare `#43`; `repo#43` only for another repo's issue.

### Banned outright

Commented-out code (git remembers it), changelog or attribution comments, banner separators, and a bare `TODO` with no issue number behind it.

## Docs

### The four kinds

Every doc is exactly one of these, and says which by its shape. A doc that wants to be two kinds is two docs.

| Kind      | Doc                                                                              | What it owes a reader                                                        |
| --------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Router    | `CLAUDE.md`                                                                      | Triggers, hard rules, commands — and **no detail**                           |
| Reference | `data-model.md`, `auth.md`, `app-shell.md`, `voice.md`, this file, `glossary.md` | What is true now, organised by the thing; the rule, then why it is that rule |
| Log       | `decisions.md`                                                                   | Dated entries, newest first, append-only                                     |
| Runbook   | `deploy.md`                                                                      | Ordered steps, plus the gotchas that cost hours                              |

### What keeps the router thin

`CLAUDE.md` carries only what is true for **every** session. A fact earns a place there only if acting without it is a mistake no matter what the session is doing. Everything else is routed, and the trigger column is the contract — written so a session can tell in one read whether the doc applies. "Read when you're curious" is not a trigger.

### One fact, one home

A fact lives in exactly one doc; the others link to it and never restate it, because a restatement is a copy that goes stale silently. Where two docs both seem to own a fact, the one whose trigger fires first owns it.

The one licensed duplicate: a **hard rule** may appear in the router as a one-liner and in its reference doc as the rule plus its reasoning.

### Form

- One `#` title, optionally with an em-dash subtitle naming the surface.
- An orientation paragraph directly under it: what the doc covers, and — for reference docs — what it is sourced from and as of when.
- `##` for sections, `###` for entries. Deeper means the doc wants splitting.
- **Prose paragraphs, not bullet soup.** Bullets are for genuine lists; a bullet holding three sentences of argument is a paragraph wearing a dot.
- **Bold carries the load-bearing sentence**, one per passage.
- **No hard wrapping.** Markdown reflows, and a hand-wrapped doc diffs badly on every edit.
- Dates absolute and ISO. Reference docs date their sourcing; the log dates every entry.

### Citing

Code by backticked path (`src/calling-card.ts`, `20260725022000_calling_card.sql`), docs by markdown link, sections with `§` (`app-shell.md § Component map`), rulings by date (`decisions.md 2026-07-25`), issues as bare `#43`. **Never a line number** — in a doc or a comment, the anchor has to survive an edit.

### Reversals

A ruling that reverses an earlier one gets a **new dated entry** in `decisions.md` naming what it reverses and why; the old entry is never edited, because it records what was believed then. Reference docs are **edited in place** to describe only what is true now — a reference carrying a struck-through paragraph is a log pretending to be a reference.

The licensed exception is `deploy.md`'s **"History, not a live instruction"** convention, where a past gotcha is worth keeping beside the step it once broke. Marked as such, or not written.

## Commit messages

### The subject

One line, **≤ 72 characters**, sentence case, no trailing period, **present indicative** — "Guests get a serial handle", not "Add serial handles". It names the change from the reader's side rather than the diff's.

An area prefix (`Mobile:`, `Deploy docs:`) is optional and earns its place when the subject would otherwise be ambiguous about where the change lands. It is a phrase, never a label from a fixed set: there is no `feat:`/`fix:` convention here and none is coming.

### The body

Required whenever the subject can't carry the why, which is every commit but a typo fix or a version bump. **Prose paragraphs hard-wrapped at 72** — no bullets; the log is argued, not itemised. A commit touching several things gets a paragraph per thing and often a one-line opener naming the batch.

State the problem in the world before the change, and name what the change cost. Restating the diff is the failure mode; git already has the diff. Issue references sit in parentheses inside the sentence that needs them: `(#46)`.

### The exceptions

Release commits keep the `vX.Y.Z — summary` form, matching `src/releases.ts`. That is the only licensed departure from the subject rules.

**No trailers, ever.** No `Co-Authored-By`, no generated-with line, no AI attribution of any kind, and no `Closes #12` either — issue references belong in the body, and gitea does not act on GitHub's keywords.

### What the hook checks

`.husky/commit-msg` enforces only what a regex can be right about: subject length and case, no trailing period, the blank line before the body, body line length, and the banned trailers. It does **not** judge tense, register, vocabulary or whether the body explains the why — a check that is wrong occasionally is a check people learn to bypass.

## Keeping it true

Every comment and doc cites a name — a file, a symbol, a migration, an issue — and never a line number, so decay is visible: a cited name that no longer resolves is the signal. **When you rename a thing, grep for its old name in `docs/` and in comments before you commit.**
