-- Lunchboxd schema: categories are shared by everyone; each ranking is one
-- person scoring one food under a category. Averages are global.
--
-- Everything lives in the `lunchboxd` schema: in production this cohabits a
-- Supabase project with gambdle.net's tables, so nothing may touch `public`.
-- The schema must also be exposed to PostgREST (config.toml api.schemas
-- locally; the Dashboard/Management API "Exposed schemas" setting hosted).

create schema if not exists lunchboxd;
grant usage on schema lunchboxd to anon, authenticated;

create table lunchboxd.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 24),
  created_at timestamptz not null default now()
);

create extension if not exists citext;

create table lunchboxd.categories (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique check (char_length(name::text) between 1 and 60),
  created_by uuid references lunchboxd.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table lunchboxd.rankings (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references lunchboxd.categories (id) on delete cascade,
  user_id uuid not null references lunchboxd.profiles (id) on delete cascade,
  food text not null check (char_length(food) between 1 and 120),
  -- Half-star steps, 0.5 through 5.
  score numeric(2, 1) not null check (score between 0.5 and 5 and mod(score * 2, 1) = 0),
  created_at timestamptz not null default now()
);

create index rankings_category_idx on lunchboxd.rankings (category_id, created_at desc);
create index rankings_recent_idx on lunchboxd.rankings (created_at desc);

-- Every new auth user (anonymous included) gets a profile row; the username
-- comes from signup metadata, falling back to a generated handle.
create function lunchboxd.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into lunchboxd.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'eater-' || substr(replace(new.id::text, '-', ''), 1, 6)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created_lunchboxd
  after insert on auth.users
  for each row execute function lunchboxd.handle_new_user();

-- The global leaderboard: one row per category with its running average.
create view lunchboxd.category_stats
with (security_invoker = true) as
select
  c.id,
  c.name::text as name,
  count(r.id) as ranking_count,
  count(distinct r.user_id) as ranker_count,
  avg(r.score) as avg_score,
  max(r.created_at) as last_ranked_at
from lunchboxd.categories c
left join lunchboxd.rankings r on r.category_id = c.id
group by c.id;

-- Table/view privileges are not granted by default; RLS then narrows row
-- access on top of these.
grant select on lunchboxd.profiles, lunchboxd.categories, lunchboxd.rankings, lunchboxd.category_stats
  to anon, authenticated;
grant insert on lunchboxd.categories, lunchboxd.rankings to authenticated;
grant update on lunchboxd.profiles to authenticated;
grant delete on lunchboxd.rankings to authenticated;

alter table lunchboxd.profiles enable row level security;
alter table lunchboxd.categories enable row level security;
alter table lunchboxd.rankings enable row level security;

-- Everything is publicly readable (it's a social site); writes are your own.
create policy "profiles are public" on lunchboxd.profiles
  for select using (true);
create policy "users edit own profile" on lunchboxd.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "categories are public" on lunchboxd.categories
  for select using (true);
create policy "signed-in users create categories" on lunchboxd.categories
  for insert with check ((select auth.uid()) = created_by);

create policy "rankings are public" on lunchboxd.rankings
  for select using (true);
create policy "users log own rankings" on lunchboxd.rankings
  for insert with check ((select auth.uid()) = user_id);
create policy "users delete own rankings" on lunchboxd.rankings
  for delete using ((select auth.uid()) = user_id);

-- Live activity: new rankings stream to every open tab.
alter publication supabase_realtime add table lunchboxd.rankings;
