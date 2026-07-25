-- Notifications: the first thing on this site that is private to one person.
--
-- Surface ruled in lunchboxd#46: a page at #/notifications with a bell in the
-- header, over a header dropdown and a passive line on your own profile. The
-- surface is what decided the schema. A page that lists items invites marking
-- one of them read, so read state is per-item — a `read_at` per row — where a
-- badge alone would have needed nothing but a single `seen_at` timestamp on
-- the profile. That cost was named and accepted when the page was chosen.
--
-- `kind` is a one-value check today. It exists because the page is the surface
-- follows (#36) and reports (#37) will land on, and adding a value to a check
-- is a migration; teaching a like-shaped table to hold a follow is a rewrite.

create table lunchboxd.notifications (
  id uuid primary key default gen_random_uuid(),
  -- The recipient. Every policy below is "this is mine".
  user_id uuid not null references lunchboxd.profiles (id) on delete cascade,
  actor_id uuid not null references lunchboxd.profiles (id) on delete cascade,
  ranking_id uuid not null references lunchboxd.rankings (id) on delete cascade,
  kind text not null check (kind in ('like')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- One notification per person per ranking per kind. Like, unlike, like again
  -- and you get one row, not three: the delete trigger below takes the row with
  -- the like, so the insert is always into an empty slot.
  constraint notifications_one_per_actor unique (user_id, actor_id, ranking_id, kind)
);

-- The inbox query, newest first, and the unread count both ride this.
create index notifications_inbox_idx on lunchboxd.notifications (user_id, created_at desc);

alter table lunchboxd.notifications enable row level security;

-- Nothing is granted by default in a custom schema. Note what is NOT here:
-- no insert and no delete for anybody. Rows arrive from the trigger below and
-- leave with the like they describe — a person cannot forge one, and cannot
-- delete one to hide it either.
grant select on lunchboxd.notifications to authenticated;
-- Column-scoped, and this is the whole defence against marking somebody else's
-- notification read or rewriting who it came from: RLS can't narrow to a
-- column, so the grant does it. Never widen this to the whole row.
grant update (read_at) on lunchboxd.notifications to authenticated;

-- Private, unlike every other table here. `anon` has no grant at all, so a
-- signed-out reader gets nothing rather than an empty list.
create policy "your notifications are yours" on lunchboxd.notifications
  for select using ((select auth.uid()) = user_id);

create policy "you mark your own read" on lunchboxd.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A like writes a notification for the ranking's author.
--
-- SECURITY DEFINER because the liker has no insert grant on this table and must
-- not have one: the row belongs to the person being told, not the person doing
-- the telling. `search_path = ''` per the same rule as every other function
-- here — a definer function with a mutable search_path is a privilege ladder.
create function lunchboxd.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  select r.user_id into author from lunchboxd.rankings r where r.id = new.ranking_id;
  -- Self-likes are already refused by the likes insert policy; this is belt
  -- and braces for anything that ever writes likes another way.
  if author is null or author = new.user_id then
    return null;
  end if;
  insert into lunchboxd.notifications (user_id, actor_id, ranking_id, kind)
  values (author, new.user_id, new.ranking_id, 'like')
  on conflict (user_id, actor_id, ranking_id, kind) do nothing;
  return null;
end;
$$;

create trigger likes_notify_author
  after insert on lunchboxd.likes
  for each row
  execute function lunchboxd.notify_on_like();

-- Taking a like back takes its notification with it, read or not.
--
-- This is also what makes retention a non-question. Notifications don't
-- accumulate on their own: a like vanishes when it's taken back, when the
-- ranking is deleted (cascade), and when the ranking is edited (the
-- clear-likes trigger), and the notification goes with it every time. There is
-- nothing to prune and no age rule to write down.
create function lunchboxd.unnotify_on_unlike()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from lunchboxd.notifications
  where actor_id = old.user_id and ranking_id = old.ranking_id and kind = 'like';
  return null;
end;
$$;

create trigger likes_unnotify_author
  after delete on lunchboxd.likes
  for each row
  execute function lunchboxd.unnotify_on_unlike();

notify pgrst, 'reload schema';
