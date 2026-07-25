---
name: verify
description: Build, run, and drive Lunchboxd locally to verify changes end-to-end (production backend + headless Chromium).
---

# Verifying Lunchboxd changes

## Backend: the hosted project

**There is no local backend, and WSL is ruled out for this project** (hard rule 4). Verification runs against the hosted Supabase project, which is the same one production uses — so treat every write as real.

- Read-only flows need nothing but a build: `.env.production` carries the hosted credentials and takes priority in a production build.
- A flow that needs a session creates a **real guest account** on the hosted project. That is a profile row that stays. It is not destructive, but say so when reporting the run, and don't do it casually.
- Anything that writes rankings, likes or renames is writing to the live site. Ask first.
- `npm run backup` before anything destructive; there is nowhere else for it to land.

**History, not a live instruction:** a local stack once ran in WSL at `~/lunchboxd-db`, and this skill used to document it as the default. WSL was ruled out on 2026-07-23 and the stack is not maintained; the instructions were removed on 2026-07-26 (#127). If a writable local backend becomes necessary, pick a Windows-side approach with the owner first (deploy.md § Local development backend).

## Frontend

- `npm run preview` after `npm run build` → http://localhost:4173/, using `.env.production`. This is the one to drive.
- `npm run dev` → http://localhost:5173/ reads `.env.local`, which points at the retired WSL stack and will not connect.
- The gate before any commit is `npm run check`.

## Driving it

Python Playwright is installed (Windows, `playwright` on PATH via Python 3.12) with Chromium browsers cached. Sync API works well. Gotchas:

- Set `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` — the app's output has ♥/★ glyphs that crash cp1252 prints.
- Mobile is emulation, not a device: `ctx = b.new_context(**p.devices["Pixel 7"])`. Chromium emulation is close to Android Chrome and is **not** iOS Safari, so a compositing or paint bug needs a real phone to confirm.
- Guest signup is one button: `page.get_by_role("button", name="Start ranking")`. There is no handle field any more — guests get a serial handle from the signup trigger.
- Click buttons via `page.get_by_role("button", name=...)`, never `text=` — `text=` is a case-insensitive substring match and the sign-in card's copy sits before its button in the DOM.
- Useful flows: rank a food (category field placeholder starts "Pizza, Vegetables", food input "Costco slice", star input via `[role=radio][aria-label='4.5 stars']`), profile pages at `#/u/<handle>` (hash routing).
- The category field is a combobox we render, not a datalist: its list is `#category-suggestions` and its rows are `[role=option]`.
- Collect `page.on("pageerror", ...)` and assert none at the end.
