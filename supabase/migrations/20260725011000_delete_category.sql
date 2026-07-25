-- Deleting a category entirely, and the one column the UI needs to decide who
-- may.
--
-- Third of the category-surgery functions (rename, merge, now delete), same
-- pattern as the other two and as ban_profile: SECURITY DEFINER with an in-body
-- permission check, rather than a delete grant on `categories`. Deleting a
-- category cascades its rankings away — that is the point of "entirely" — so
-- there is no undo and no soft-delete.
--
-- Two people may delete one:
--
--   * an admin, always — the tidy-up power that rename and merge already give;
--   * the person who invented it, but only while nobody else has ranked in it.
--
-- The second rule is the "I typo'd a category into existence" case. It stops
-- there deliberately: a category is a communal namespace, so once other people
-- have ranked in it, deleting it destroys their rankings, and inventing a
-- category first must not confer that. Once someone else has joined, it takes
-- an admin.

create function lunchboxd.delete_category(cat uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_admin boolean;
  caller_banned timestamptz;
  invented_by uuid;
  outsiders bigint;
begin
  select p.is_admin, p.banned_at into caller_admin, caller_banned
  from lunchboxd.profiles p where p.id = caller;
  if not found then
    raise exception 'Sign in to delete a category.';
  end if;

  select c.created_by into invented_by from lunchboxd.categories c where c.id = cat;
  if not found then
    raise exception 'That category no longer exists.';
  end if;

  -- Messages here are readable rather than terse: the buttons are gated in the
  -- UI, so anything raised has already surfaced through an unexpected path and
  -- gets shown to whoever hit it.
  if not caller_admin then
    if caller_banned is not null then
      raise exception 'This account can no longer change anything here.';
    end if;
    if invented_by is null or invented_by <> caller then
      raise exception 'Only the person who invented this category can delete it.';
    end if;
    select count(*) into outsiders
    from lunchboxd.rankings r
    where r.category_id = cat and r.user_id <> caller;
    if outsiders > 0 then
      raise exception 'Other people have ranked here — an admin has to delete this one.';
    end if;
  end if;

  delete from lunchboxd.categories where id = cat;
end;
$$;

revoke all on function lunchboxd.delete_category(uuid) from public;
grant execute on function lunchboxd.delete_category(uuid) to authenticated;

-- `created_by` joins the leaderboard view so the client can tell whether to
-- offer the inventor's delete button without a second query per category. It is
-- appended at the end of the select list because `create or replace view` may
-- only add columns there.
create or replace view lunchboxd.category_stats
with (security_invoker = true) as
with per_user as (
  select category_id, user_id, avg(score) as user_avg
  from lunchboxd.rankings
  group by category_id, user_id
),
by_person as (
  select category_id, count(*) as ranker_count, avg(user_avg) as person_avg
  from per_user
  group by category_id
),
by_ranking as (
  select category_id, count(*) as ranking_count, max(created_at) as last_ranked_at
  from lunchboxd.rankings
  group by category_id
),
site as (
  select coalesce(avg(user_avg), 3.0) as mean from per_user
)
select
  c.id,
  c.name::text as name,
  coalesce(r.ranking_count, 0) as ranking_count,
  coalesce(p.ranker_count, 0) as ranker_count,
  p.person_avg as avg_score,
  r.last_ranked_at,
  case
    when p.ranker_count is null then null
    else ((select mean from site) * 3 + p.person_avg * p.ranker_count) / (3 + p.ranker_count)
  end as weighted_score,
  c.created_by
from lunchboxd.categories c
left join by_person p on p.category_id = c.id
left join by_ranking r on r.category_id = c.id;

notify pgrst, 'reload schema';
