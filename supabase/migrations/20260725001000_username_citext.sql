-- Handles become case-insensitive, matching categories.
--
-- `categories.name` has been citext since init, so #/c/Pizza and #/c/pizza are
-- one category. `profiles.username` was plain text, so #/u/Jack rendered "No
-- one by that handle" when the handle was `jack` — the same app with two rules,
-- and the profile one failed silently. It also let `jack` and `Jack` be two
-- accounts, which on a site where the handle is the whole identity model is
-- free impersonation, and a ban would only take down one of them.
--
-- The preceding migration merged the six existing case-collisions; this index
-- cannot be built until it has run.

alter table lunchboxd.profiles
  drop constraint profiles_username_check;

alter table lunchboxd.profiles
  alter column username type citext;

alter table lunchboxd.profiles
  add constraint profiles_username_check
    check (char_length(username::text) between 2 and 24);

notify pgrst, 'reload schema';
