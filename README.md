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

### Local backend (WSL)

Docker lives in WSL on this machine, so the local Supabase stack runs there:

```
wsl bash -lc "mkdir -p ~/lunchboxd-db && cp -r /mnt/c/Users/Jack/lunchboxd/supabase ~/lunchboxd-db/ && cd ~/lunchboxd-db && npx -y supabase start"
```

Point `.env.local` at `http://<wsl-ip>:54321` (get it with `wsl hostname -I`; Windows-side `localhost` forwarding does not reach the Docker-published ports). The anon key comes from `npx supabase status`. The stack stops whenever the WSL VM idles out; rerun `supabase start` to bring it back. After editing migrations: copy them over and `npx supabase db reset`.

### Production — gambdle.net/lunchboxd

Live at <https://gambdle.net/lunchboxd/>, served as a folder of the Gambdle GitHub Pages repo. The backend shares Gambdle's hosted Supabase project (`kxbteesmfozqzoxzktzv`), fully isolated in a `lunchboxd` Postgres schema — nothing touches Gambdle's tables. `.env.production` (committed; the anon key is public by design) supplies the hosted credentials, and `vite.config.ts` sets `base: '/lunchboxd/'`.

To deploy:

```
npm run build
# replace the folder in the Pages repo and push
rm -r ../Documents/GitHub/Gambdle/lunchboxd; cp -r dist ../Documents/GitHub/Gambdle/lunchboxd
cd ../Documents/GitHub/Gambdle && git add lunchboxd && git commit -m "Deploy lunchboxd" && git push
```

Schema changes go through `supabase/migrations/` and are applied to the hosted project with the Supabase Management API (PAT in `~/.claude.json`, the same one Gambdle's `supabase/deploy-fn.js` uses). One-time hosted config already done: `lunchboxd` added to PostgREST's exposed schemas, anonymous sign-ins enabled, site URL + redirect allow-list set to `https://gambdle.net/lunchboxd/`.
