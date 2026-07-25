# Auth model

How people get an identity on Lunchboxd and what that identity can touch. Sourced from the code (`src/auth.tsx`, `supabase/migrations/`), authoritative as of 2026-07-26.

## Session kinds

Both are real Supabase Auth sessions with a genuine `auth.uid()`:

- **Guest** — Supabase anonymous sign-in (`is_anonymous: true`), created by the "Start ranking" button in one click. No handle is asked for and none is honoured: guests are named `guest-<6 hex>` (below). This is still the primary flow; the sign-in card is guest-first by design.
- **Email account** — magic link (`signInWithOtp`), or a guest upgraded in place via "Keep account" (`updateUser({ email })` attaches an email to the same UID, so the handle and rankings carry over).

The card's second section is the returning visitor's door: divider "already have an account?", button "Send sign-in link". It deliberately still creates an account for an address it hasn't seen (`shouldCreateUser` left at its default), so the same field serves sign-in and email-first signup; the helper line says so rather than letting it surprise anyone. Ruling: `decisions.md` 2026-07-24.

## Handles

- A profile row is created for every new auth user by the `handle_new_user` trigger (SECURITY DEFINER, `supabase/migrations/20260723120000_init.sql`, the collision rework in `20260724150000_username_collision.sql`, guest naming in `20260725020000_guest_handles.sql`). The username comes from signup metadata, falling back to a generated `<prefix>-<6 hex chars of uid>`.
- **A guest never gets the handle it asks for.** Anonymous signups are named `guest-<6 hex>`, and so is any signup whose metadata requests a `guest-*` name. Email-backed signups get what they ask for, falling back to `eater-<6 hex>` — that prefix means "hasn't picked a name yet", not "temporary". Ruling and reasoning: decisions.md 2026-07-25.
- **Picking a handle requires an email.** The `profiles_handle_rules` trigger refuses a username change while `auth.users.is_anonymous` is true, and refuses anyone claiming a `guest-*` name. It reads the **table column, not the JWT claim** — the claim stays stale until the session refreshes, so a guest who had just confirmed their email would have been told to add the email they had just added. It's a trigger rather than a check constraint (which would reject the rows the signup trigger itself writes) or an RLS narrowing (which applies to the whole update and would take `tags` down with it — guests keep their flair).
- **Handles are owned by their account forever**, including signed-out guest accounts nobody can ever recover. The trigger therefore never fails on a collision: it falls back to `name-2`, `name-3`, …, and after 20 attempts to a longer generated handle that keeps the attempt counter in it, so it can't settle on one colliding candidate and spin. A naive trigger that raised on conflict used to fail the whole signup and lock the handle permanently — that's the bug the rework fixed.
- **You can rename yourself** from your own profile (the ✎ next to the name → `renameProfile` in `src/data.ts`; RLS + the column grant limit the update to your own row's username/tags). Renaming releases the old handle for anyone to claim. A rename collision is a plain unique violation — the trigger's `name-2` fallback only applies at signup — so the client maps error codes 23505/23514 to friendly messages, and the handle-rules trigger's own refusals arrive as P0001, which `writeError` passes through as written. This is how an email-first signup gets off its generated `eater-*` name, and how a guest gets off `guest-*` once the email is confirmed. The ✎ isn't rendered for a guest at all — `ProfilePage` takes `viewerIsGuest` and shows the reason in its place, since the DB would refuse the rename anyway.
- `useAuth` retries the profile fetch briefly after signup because the trigger's row can land a beat after the session does.

## The email-redirect rule

The Supabase project's Site URL belongs to Gambdle (`gambdle.net`), not to Lunchboxd — it's the shared project's single global value and can't be changed without breaking Gambdle, even though Lunchboxd now has its own domain. **Every auth call that sends an email must pass `emailRedirectTo: window.location.origin + import.meta.env.BASE_URL`** or the emailed link strands the user on the Gambdle homepage. This applies to `signInWithOtp` AND `updateUser({ email })` (the second one was missed once; fixed 2026-07-23). With `base: '/'` this resolves to `https://lunchboxd.live/`, which is on the hosted project's redirect allow-list.

## Sign-out warning

Signing out of a guest account is destructive: the account is unrecoverable, and the rankings stay up under the orphaned profile with nobody able to add to them. The header's sign-out button confirms with an explanation for anonymous sessions and points at **"Add email"** (the old "Keep account" label — renamed 2026-07-25, since attaching an email now buys the handle as well as the recovery). What that warning no longer needs to mourn is the handle itself, which is a serial number by then.

## RLS posture

Everything is publicly readable (it's a social site); writes are your own rows only. The full matrix lives in [data-model.md](data-model.md).
