-- Hearts (Letterboxd-style likes): anyone can heart anyone's ranking; one
-- heart per person per ranking. Public to read, yours to give and take back.
--
-- Dropped the same day by 20260724170000_heart_own_ranking.sql: one mark
-- doing two jobs left "loved it" ambiguous about whose opinion it carried.
-- The `lunchboxd.likes` table that exists today is a different one, created
-- by 20260725014000_likes.sql — a second mark beside `hearted`, not this.

create table lunchboxd.likes (
  ranking_id uuid not null references lunchboxd.rankings (id) on delete cascade,
  user_id uuid not null references lunchboxd.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ranking_id, user_id)
);

grant select on lunchboxd.likes to anon, authenticated;
grant insert, delete on lunchboxd.likes to authenticated;

alter table lunchboxd.likes enable row level security;

create policy "likes are public" on lunchboxd.likes
  for select using (true);
create policy "users give their own likes" on lunchboxd.likes
  for insert with check ((select auth.uid()) = user_id);
create policy "users take back their own likes" on lunchboxd.likes
  for delete using ((select auth.uid()) = user_id);
