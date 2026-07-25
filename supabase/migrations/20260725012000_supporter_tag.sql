-- "Supporter": the badge for people who have donated.
--
-- It is a column, not an entry in the profiles.tags roster, because the update
-- grant on profiles covers `tags` -- anything inside that array is self-service
-- by construction, and a badge that says "this person paid" must not be
-- self-issuable. Same shape as is_admin: granted by hand in SQL, no UI, no RPC.
-- Being a column also keeps it out of the one flair slot
-- (profiles_tags_single), so a supporter still wears their Peloton/Zwift/Runner
-- tag next to it.
--
-- A ban does not clear it (unlike tags): the donation happened. Banned
-- profiles render no badges at all, so nothing shows either way.

alter table lunchboxd.profiles
  add column is_supporter boolean not null default false;

-- The first five. `username` is citext, so these match whatever the casing.
update lunchboxd.profiles
set is_supporter = true
where username in ('scytop', 'exa', 'dougmcfawn', 'chef', 'ugoffishungry');

notify pgrst, 'reload schema';
