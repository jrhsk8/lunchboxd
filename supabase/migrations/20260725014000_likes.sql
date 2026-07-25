-- Likes: the mark other people put on your ranking.
--
-- Distinct from `hearted`, which stays exactly what it was — the author's own
-- "loved it" on their own ranking (decisions.md 2026-07-23). A like is what
-- somebody ELSE gives, it lands on any ranking whether or not it carries review
-- text, and it is the number behind the calling card's headline stat.
--
-- This reinstates cross-user likes, which were built and torn out on
-- 2026-07-23 with "don't reintroduce without a ruling". The ruling is
-- lunchboxd#42, and it is stricter than the design that was removed:
--
--   * only accounts with an email attached may like. Anonymous sign-up is free
--     and uncaptcha'd (#28), so a guest-likeable count is stuffable by one
--     person with a handful of sessions. This mutes 26 of the 70 accounts that
--     have actually ranked something — accepted deliberately, and it gives
--     "Keep account" its first concrete reason to exist;
--   * no self-likes. `hearted` already is the author's mark on their own row;
--   * one like per person per ranking;
--   * any edit to the ranking clears its likes (see the trigger below).

create table lunchboxd.likes (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references lunchboxd.rankings (id) on delete cascade,
  user_id uuid not null references lunchboxd.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_one_per_person unique (ranking_id, user_id)
);

-- The unique constraint's index leads on ranking_id, so counting a row's likes
-- is covered. This one is for the other direction: the likes a person gave.
create index likes_user_idx on lunchboxd.likes (user_id, created_at desc);

alter table lunchboxd.likes enable row level security;

-- Nothing is granted by default in a custom schema; RLS narrows on top.
grant select on lunchboxd.likes to anon, authenticated;
grant insert, delete on lunchboxd.likes to authenticated;

create policy "likes are public" on lunchboxd.likes
  for select using (true);

-- The email-only rule reads the `is_anonymous` JWT claim rather than joining
-- auth.users: the `authenticated` role has no select on that table, so a policy
-- referencing it would fail closed for everybody, including the people meant to
-- pass. A guest who later attaches an email flips the claim on their next token
-- and can like from then on — nothing to backfill.
create policy "email accounts like other people's rankings" on lunchboxd.likes
  for insert with check (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false
    and (select banned_at is null from lunchboxd.profiles where id = (select auth.uid()))
    -- Not your own ranking: that is what `hearted` is for.
    and (select r.user_id from lunchboxd.rankings r where r.id = ranking_id) <> (select auth.uid())
  );

create policy "users take back their own likes" on lunchboxd.likes
  for delete using ((select auth.uid()) = user_id);

-- Editing a ranking clears its likes.
--
-- Owner-ruled (#42) over the narrower "only a food change clears them": a like
-- always refers to exactly what is on screen. The accepted cost is that fixing
-- a typo in a review costs the likes it earned.
--
-- "Edit" means the three fields the inline editor exposes. `hearted` and
-- `top_rank` are deliberately NOT in the WHEN clause — they are separate
-- columns behind separate controls, and firing on any update at all would make
-- pinning a ranking to your top four silently destroy its likes.
create function lunchboxd.clear_likes_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from lunchboxd.likes where ranking_id = new.id;
  return null;
end;
$$;

create trigger rankings_edit_clears_likes
  after update on lunchboxd.rankings
  for each row
  when (
    old.food is distinct from new.food
    or old.score is distinct from new.score
    or old.review is distinct from new.review
  )
  execute function lunchboxd.clear_likes_on_edit();

-- A ban already deletes the target's rankings (taking the likes ON them with it
-- by cascade) and the categories they invented. It now also deletes the likes
-- they GAVE, so a banned account stops propping up everyone else's counts.
-- Everything else about this function is unchanged.
create or replace function lunchboxd.ban_profile(target uuid)
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
  delete from lunchboxd.likes where user_id = target;
  delete from lunchboxd.rankings where user_id = target;
  delete from lunchboxd.categories where created_by = target;
  update lunchboxd.profiles set banned_at = now(), tags = '{}' where id = target;
end;
$$;

notify pgrst, 'reload schema';
