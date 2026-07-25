# CLAUDE.md

## How to speak to the user

Countable limits, because "be brief" was ignored for a whole session while every rule below was technically being followed:

- **Six lines is the cap** for a chat reply. Over it, cut — don't reformat.
- **No headings, no bullet lists, no bold** unless asked for them. A list of findings is a paragraph.
- **One reply, one thing.** A second topic waits for a second reply.
- **Never summarise the work at the end.** The diff and the commit say what changed; a closing recap is the longest thing in a reply and the least read.
- **No jargon, no em-dashes, no claude-isms** ("footgun", "idempotent", "load-bearing").
- **Don't restate what was already said**, including the question just asked.

Report a finished job in one line: what happened, and the one number or name that proves it. Ask a blocking question in one line. Everything else is the code.

Written artefacts — comments, commits, docs, UI strings — follow docs/writing/ instead, and nothing here applies to them.

## About

Lunchboxd is a site where you rate food, together — like Letterboxd, but the subject matter is edible and the categories are communal. Anyone invents a category; everyone ranks foods under it out of five stars; every category keeps a global running average.

This file is a router: the doc map, the hard rules, and the commands. Detail lives in the routed docs — read the one whose trigger matches what you're about to do.

## Read when

| Doc                                                  | Read when                                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [docs/app/data-model.md](docs/app/data-model.md)     | Reading or writing Supabase data, adding a migration, touching RLS, or changing how views refresh (the `version` counter)  |
| [docs/app/auth.md](docs/app/auth.md)                 | Any auth/session/handle work, or any flow that sends an auth email (the emailRedirectTo rule)                              |
| [docs/app/app-shell.md](docs/app/app-shell.md)       | Adding a page or route, or any CSS/visual/layout change: hash routing rationale, component map, design tokens and idioms   |
| [docs/writing/voice.md](docs/writing/voice.md)       | Writing or editing any user-facing string                                                                                  |
| [docs/writing/prose.md](docs/writing/prose.md)       | Writing a comment, editing a doc, or writing a commit message — the register, what earns a comment, and the subject rules  |
| [docs/writing/glossary.md](docs/writing/glossary.md) | Naming anything: a variable, a column, a component, or a concept in prose. Also when a word feels like it has two meanings |
| [docs/meta/decisions.md](docs/meta/decisions.md)     | Before proposing an approach that might reverse a past ruling; newest first, grep for the term or date                     |
| [docs/meta/deploy.md](docs/meta/deploy.md)           | Deploying, touching hosted Supabase config, or setting up a local backend                                                  |

## Hard rules (always apply)

1. **Six lines is the cap on a chat reply, and no lists or headings in one.** The section above is the whole rule; it is here because it was the rule that got ignored.
2. **Everything database-side lives in the `lunchboxd` schema; nothing ever touches `public`.** The hosted Supabase project is shared with gambdle.net. (docs/app/data-model.md)
3. **Every auth call that sends an email passes `emailRedirectTo`** — the project's Site URL is Gambdle's, not ours. (docs/app/auth.md)
4. **Deploy is a deliberate manual step, never automated on push** — `wrangler pages deploy` to Cloudflare, nothing else. This repo deploys nothing to Gambdle; the two share only the Supabase project. (docs/meta/deploy.md)
5. **No WSL for this project.** Build, verify, and deploy from Windows. (docs/meta/deploy.md § Local development backend)
6. **`npm run check` green before committing source changes** — that's format, lint, build (tsc + vite), and tests, in one command.
7. **One word per concept, everywhere** — prose _and_ identifiers. Eater, ranking, handle, like, loved it; never "user" in prose, never "rating" at all. (docs/writing/glossary.md)
8. **Regenerate types after every migration** (`npm run types`) — `src/database.types.ts` is generated from the live schema and is what keeps queries honest. **Back up before anything destructive** (`npm run backup`); there is no local stack, so migrations land in production. (docs/meta/deploy.md)

## Commands

- `npm run dev` — dev server at http://localhost:5173/ (root base path)
- `npm run build` — typecheck + production build
- `npm run check` — format check, lint, build, test (the pre-commit gate)
- `npm run test` / `npm run lint` / `npm run format` — individually
- `npm run backup` — dump the `lunchboxd` schema's rows outside the repo
- `npm run types` — regenerate `src/database.types.ts` from the live schema
- `npm run deploy` — `wrangler pages deploy dist` (manual, deliberate, never automated)
- Verification: the [verify skill](.claude/skills/verify/SKILL.md) has the end-to-end drive recipe (Playwright + gotchas)
