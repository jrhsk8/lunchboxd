# lunchboxd

a site where you rate food, together

Like Letterboxd, but the subject matter is edible and the categories are communal. Anyone can invent an arbitrary food category ("Pizza", "Gas Station Sushi", "Things Served in a Bread Bowl"); everyone ranks foods under them out of five stars (half stars allowed); every category keeps a global running average that shifts with each ranking anyone logs. Rank pizza a 2 and someone else ranks it a 5, and Pizza sits at 3.50.

## Features

- **Shared categories**: one global namespace (case-insensitive unique), first ranker invents it, everybody piles on.
- **Global leaderboard**: categories sorted by average, with ranking and ranker counts; your personal average shown alongside the global one.
- **Activity feed**: who ranked what, where, and how hard, site-wide, with live updates (Supabase realtime + poll fallback).
- **Accounts**: guest sign-in with a handle (Supabase anonymous auth) or email magic link.

## Stack

React 19 + TypeScript + Vite + Tailwind CSS v4, backed by Supabase (Postgres, RLS, auth, realtime). Design language borrowed from [Maxout](https://maxout.art): warm editorial dark, Schibsted Grotesk, clay accent, gold stars.

Schema lives in `supabase/migrations/`. RLS: everything publicly readable; you can only write your own rankings and delete your own.

## Development

```
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build
```

Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Docs

[CLAUDE.md](CLAUDE.md) is the router: a read-when table over the `docs/` tree (data model, auth, app shell, copy voice, decisions log, deploy). Production runs at <https://lunchboxd.live/>; the deploy procedure and hosted-Supabase config live in [docs/meta/deploy.md](docs/meta/deploy.md).
