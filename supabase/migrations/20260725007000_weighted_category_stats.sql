-- The leaderboard becomes one-person-one-vote, with a prior.
--
-- Two compounding holes. The average was over RANKINGS, not over people, so
-- someone logging ten different foods in a category moved it ten times as far
-- as someone logging one. And the sort had no minimum sample size, so a
-- category invented thirty seconds ago with a single 5.0 outranked one with 50
-- rankings averaging 4.8. `ranker_count` was computed and displayed but never
-- influenced anything.
--
-- Now: each person's scores within a category are averaged first, and the
-- category average is the mean of those per-person averages. `avg_score`
-- therefore changes meaning — it is the number a reader assumes it already was.
--
-- `weighted_score` adds a Bayesian prior of PRIOR_RANKERS notional voters at
-- the site-wide mean, which is what the board sorts by. A category with one
-- 5.0 sits near the mean until real people agree with it; one with fifty
-- rankers is barely moved. The prior is deliberately small — this is a site
-- where a category having three rankers is normal.

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
  end as weighted_score
from lunchboxd.categories c
left join by_person p on p.category_id = c.id
left join by_ranking r on r.category_id = c.id;

notify pgrst, 'reload schema';
