-- Profile page stats move server-side.
--
-- The profile page fetched a person's rankings with `limit 500` and computed
-- the average, category count and loved count from that array. Past 500
-- rankings the displayed "lifetime average" was silently the average of the
-- most recent 500 — a wrong number presented as fact, with nothing to say so.
--
-- The list stays capped (pagination is its own job); the numbers no longer come
-- from it.

create view lunchboxd.profile_stats
with (security_invoker = true) as
select
  p.id as user_id,
  count(r.id) as ranking_count,
  count(distinct r.category_id) as category_count,
  count(r.id) filter (where r.hearted) as hearted_count,
  avg(r.score) as avg_score
from lunchboxd.profiles p
left join lunchboxd.rankings r on r.user_id = p.id
group by p.id;

grant select on lunchboxd.profile_stats to anon, authenticated;

notify pgrst, 'reload schema';
