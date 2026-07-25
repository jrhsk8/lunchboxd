-- Six pairs of accounts differed only by case ("Chef"/"CHEF", "will"/"Will",
-- ...). Guest accounts are unrecoverable, so the likeliest story is one person
-- losing a session and signing up again, landing on a case variant that the
-- unique constraint on `username` treated as a different handle. Categories
-- have always been citext; handles were not. The next migration fixes that,
-- and it cannot create its unique index until these pairs are resolved.
--
-- Resolution, owner-ruled 2026-07-25: merge each pair and keep the properly
-- capitalised handle. The surviving ACCOUNT is the one with the activity — for
-- four of the six pairs that is the lowercase side, so keeping the
-- prettier-looking profile row would have orphaned the person actually using
-- the site. The dormant account's rows move across and its auth user is
-- deleted.
--
-- auth.users is safe to delete from here: it holds exactly the 86 Lunchboxd
-- profiles and nothing else — Gambdle, which shares this project, does not use
-- Supabase Auth. Both the lunchboxd tables and these six auth rows were backed
-- up to ../lunchboxd-backups/ before this ran.

create or replace function pg_temp.merge_accounts(keep_handle text, drop_handle text, final_handle text)
returns void
language plpgsql
as $$
declare
  keep_id uuid;
  drop_id uuid;
begin
  select id into keep_id from lunchboxd.profiles where username = keep_handle;
  select id into drop_id from lunchboxd.profiles where username = drop_handle;
  if keep_id is null or drop_id is null then
    raise notice 'skipping %/% — already merged', keep_handle, drop_handle;
    return;
  end if;

  update lunchboxd.rankings set user_id = keep_id where user_id = drop_id;
  update lunchboxd.categories set created_by = keep_id where created_by = drop_id;
  -- Cascades to lunchboxd.profiles via the profiles.id FK.
  delete from auth.users where id = drop_id;
  update lunchboxd.profiles set username = final_handle where id = keep_id;
end;
$$;

--                          keep (has the rankings)  drop (dormant)   final handle
select pg_temp.merge_accounts('CHEF',                'Chef',          'Chef');
select pg_temp.merge_accounts('will',                'Will',          'Will');
select pg_temp.merge_accounts('Exa',                 'exa',           'Exa');
select pg_temp.merge_accounts('topoftheline',        'TopOfTheLine',  'TopOfTheLine');
select pg_temp.merge_accounts('zach',                'Zach',          'Zach');
select pg_temp.merge_accounts('native',              'Native',        'Native');
