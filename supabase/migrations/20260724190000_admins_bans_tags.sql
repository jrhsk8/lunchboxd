-- Admins, bans, and self-service profile tags.
--
-- Admins get a badge and the ban hammer. Banning removes the target's
-- rankings AND the categories they invented (cascading away everyone's
-- rankings inside those categories -- a spammer's junk namespace goes down
-- with them), then locks the account out of writing.
--
-- Tags are Discord-flair-style self-labels from a fixed roster.

alter table lunchboxd.profiles
  add column is_admin boolean not null default false,
  add column banned_at timestamptz,
  add column tags text[] not null default '{}'
    constraint profiles_tags_allowed check (tags <@ array['peloton', 'zwift']);

-- Only the owner edits a profile, and only its username and tags: with the
-- old whole-row update grant a user could set their own is_admin or clear
-- their banned_at through PostgREST.
revoke update on lunchboxd.profiles from authenticated;
grant update (username, tags) on lunchboxd.profiles to authenticated;

-- Banned accounts keep their session but lose write access.
drop policy "users log own rankings" on lunchboxd.rankings;
create policy "users log own rankings" on lunchboxd.rankings
  for insert with check (
    (select auth.uid()) = user_id
    and (select banned_at is null from lunchboxd.profiles where id = (select auth.uid()))
  );

drop policy "signed-in users create categories" on lunchboxd.categories;
create policy "signed-in users create categories" on lunchboxd.categories
  for insert with check (
    (select auth.uid()) = created_by
    and (select banned_at is null from lunchboxd.profiles where id = (select auth.uid()))
  );

-- The ban itself is a SECURITY DEFINER function rather than broad delete
-- grants to authenticated: one atomic, admin-checked action.
create function lunchboxd.ban_profile(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from lunchboxd.profiles
    where id = (select auth.uid()) and is_admin
  ) then
    raise exception 'only admins can ban';
  end if;
  if target = (select auth.uid()) then
    raise exception 'you cannot ban yourself';
  end if;
  if exists (select 1 from lunchboxd.profiles where id = target and is_admin) then
    raise exception 'admins cannot be banned';
  end if;
  delete from lunchboxd.rankings where user_id = target;
  delete from lunchboxd.categories where created_by = target;
  update lunchboxd.profiles set banned_at = now(), tags = '{}' where id = target;
end;
$$;

revoke all on function lunchboxd.ban_profile(uuid) from public;
grant execute on function lunchboxd.ban_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
