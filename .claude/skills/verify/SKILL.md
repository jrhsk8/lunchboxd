---
name: verify
description: Build, run, and drive Lunchboxd locally to verify changes end-to-end (local WSL Supabase stack + headless Chromium).
---

# Verifying Lunchboxd changes

## Backend: local Supabase stack in WSL

**Jack prefers not to use WSL for this project** — ask before spinning up the WSL stack. For read-only verification the production backend (`.env.production` credentials) works; only reach for the local stack when the flow needs writes.

`.env.local` points at a local Supabase stack running in WSL (NOT production — prod is Gambdle's shared project). The stack lives at `~/lunchboxd-db` in WSL; only the `supabase/` config dir is there, the app repo is not.

- The WSL IP changes per boot: `wsl hostname -I` (first address). Update `VITE_SUPABASE_URL` in `.env.local` if it drifted.
- Health check: `curl http://<ip>:54321/auth/v1/health` (the bare `/rest/v1/` path hangs — don't probe it).
- CLI: `~/.local/bin/supabase` in WSL (install from GitHub releases if missing — it has gone missing before).
- **Keep `~/lunchboxd-db/supabase/` in sync with this repo's `supabase/`** (config.toml + migrations), then:
  ```
  wsl -e bash -lc "cd ~/lunchboxd-db && ~/.local/bin/supabase start --ignore-health-check && ~/.local/bin/supabase db reset"
  ```
  `--ignore-health-check` matters: if the `lunchboxd` schema is missing (config exposes it but migrations unapplied), plain `start` 503s and stops the containers — chicken-and-egg with `db reset`.
- Writes to this DB are fine (guest signups, rankings). It's throwaway dev data; `db reset` wipes it.
- **The WSL VM idles out between commands** and takes its networking with it — from Windows the stack times out, then 503s while containers restart on the next `wsl` invocation. Hold the VM open for the whole verification with a background `wsl -e bash -c "sleep 900"`, then poll `/auth/v1/health` until 200 before driving.

## Frontend

- `npm run dev` (background) → http://localhost:5173/ (root base path).
- Build check: `npx tsc -b && npx vite build`. Format: `npx prettier --write src`.

## Driving it

Python Playwright is installed (Windows, `playwright` on PATH via Python 3.12) with Chromium browsers cached. Sync API works well. Gotchas:

- Set `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` — the app's output has ♥/★ glyphs that crash cp1252 prints.
- Guest handles are claimed forever; use a unique handle per run (`f"verify_hank{int(time.time()) % 10000}"`).
- Click buttons via `page.get_by_role("button", name=...)`, never `text=` — `text=` is a case-insensitive substring match and the sign-in card's copy ("Pick a handle to start ranking.") sits before the "Start ranking" button in the DOM, so `text=Start ranking` silently clicks the paragraph.
- Useful flows: guest signup (fill `input[placeholder='hotdog_hank']`, click "Start ranking"), rank a food (category name input placeholder contains "Gas Station Sushi", food input "Costco slice", star input via `[role=radio][aria-label='4.5 stars']`), profile pages at `#/u/<handle>` (hash routing).
- Collect `page.on("pageerror", ...)` and assert none at the end.
