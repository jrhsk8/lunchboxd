# Auth model

How people get an identity on Lunchboxd and what that identity can touch. Sourced from the code (`src/auth.tsx`, `supabase/migrations/`), authoritative as of 2026-07-23.

## Session kinds

Both are real Supabase Auth sessions with a genuine `auth.uid()`:

- **Guest** — Supabase anonymous sign-in (`is_anonymous: true`), created from the "Start ranking" path with a chosen handle in the signup metadata. This is the primary flow; the sign-in card is guest-first by design.
- **Email account** — magic link (`signInWithOtp`), or a guest upgraded in place via "Keep account" (`updateUser({ email })` attaches an email to the same UID, so the handle and rankings carry over).

## Handles

- A profile row is created for every new auth user by the `handle_new_user` trigger (SECURITY DEFINER, `supabase/migrations/20260723120000_init.sql` + the collision rework in `20260724150000_username_collision.sql`). The username comes from signup metadata, falling back to `eater-<6 hex chars of uid>`.
- **Handles are owned by their account forever**, including signed-out guest accounts nobody can ever recover. The trigger therefore never fails on a collision: it falls back to `name-2`, `name-3`, …, and after 20 attempts to the generated `eater-*` handle. A naive trigger that raised on conflict used to fail the whole signup and lock the handle permanently — that's the bug the rework fixed.
- The client pre-checks availability before guest signup purely for a friendly message; a race past that check is safe because of the trigger fallback.
- **You can rename yourself** from your own profile (the ✎ next to the name → `renameProfile` in `src/data.ts`; RLS + the column grant limit the update to your own row's username/tags). Renaming releases the old handle for anyone to claim. A rename collision is a plain unique violation — the trigger's `name-2` fallback only applies at signup — so the client maps error codes 23505/23514 to friendly messages. This is the escape hatch for email-first signups, which skip the handle step and land on a generated `eater-*` name.
- `useAuth` retries the profile fetch briefly after signup because the trigger's row can land a beat after the session does.

## The email-redirect rule

The Supabase project's Site URL belongs to Gambdle (`gambdle.net`), not to Lunchboxd. **Every auth call that sends an email must pass `emailRedirectTo: window.location.origin + import.meta.env.BASE_URL`** or the emailed link strands the user on the Gambdle homepage. This applies to `signInWithOtp` AND `updateUser({ email })` (the second one was missed once; fixed 2026-07-23). `https://gambdle.net/lunchboxd/` is on the hosted project's redirect allow-list.

## Sign-out warning

Signing out of a guest account is destructive (the account, and with it the handle, is unrecoverable; the rankings stay up under the orphaned profile). The header's sign-out button confirms with an explanation for anonymous sessions and points at "Keep account" first.

## RLS posture

Everything is publicly readable (it's a social site); writes are your own rows only. The full matrix lives in [data-model.md](data-model.md).
