-- The calling card: the three stats a person puts on their profile, and the
-- numbers behind every stat they could choose.
--
-- Ported from maxout.art (packages/data/schema.sql, apps/play/src/identity/) —
-- the shape, not the stats. Three slots, a CHECK-pinned closed vocabulary, and
-- an accent that only applies while the Supporter badge holds.
--
-- The vocabulary is deliberately half counters and half NAMES, which is where
-- this departs from the original. maxout's card carries scores in the hundreds
-- of thousands; here the median person has four rankings and the busiest has
-- twenty-eight, so three counters would read "4 / 3 / 0" on most profiles.
-- "Pizza — most-ranked category" is the stat that is interesting at four
-- rankings. Ruled in lunchboxd#43.

alter table lunchboxd.profiles
  add column card_slot_1 text,
  add column card_slot_2 text,
  add column card_slot_3 text,
  add column card_accent text;

-- One list, pinned three times. Keep it in lockstep with CARD_STAT_KEYS in
-- src/calling-card.ts — the client validates each stored slot on read anyway
-- (an unknown key falls back to the default for that position rather than
-- rendering blank), but the CHECK is what stops a hand-rolled PATCH storing
-- junk in the first place.
alter table lunchboxd.profiles
  add constraint profiles_card_slots_check check (
    (card_slot_1 is null or card_slot_1 in (
      'likes.received', 'likes.given', 'hearts.given',
      'rankings.count', 'reviews.count', 'categories.ranked', 'categories.invented',
      'score.average', 'score.highest', 'score.lowest',
      'category.most', 'category.kindest', 'category.harshest',
      'eating.since'))
    and (card_slot_2 is null or card_slot_2 in (
      'likes.received', 'likes.given', 'hearts.given',
      'rankings.count', 'reviews.count', 'categories.ranked', 'categories.invented',
      'score.average', 'score.highest', 'score.lowest',
      'category.most', 'category.kindest', 'category.harshest',
      'eating.since'))
    and (card_slot_3 is null or card_slot_3 in (
      'likes.received', 'likes.given', 'hearts.given',
      'rankings.count', 'reviews.count', 'categories.ranked', 'categories.invented',
      'score.average', 'score.highest', 'score.lowest',
      'category.most', 'category.kindest', 'category.harshest',
      'eating.since'))
  );

alter table lunchboxd.profiles
  add constraint profiles_card_accent_check check (
    card_accent is null or card_accent in ('clay', 'teal', 'blue', 'violet', 'gold')
  );

-- The update grant on profiles is column-scoped on purpose: that scoping is the
-- entire defence against somebody setting their own is_admin or is_supporter
-- from the browser console. Widen it to exactly these four and no further.
grant update (username, tags, card_slot_1, card_slot_2, card_slot_3, card_accent)
  on lunchboxd.profiles to authenticated;

-- Every number a card might show, one row per profile.
--
-- Its own view rather than more columns on `profile_stats`: that one feeds the
-- four tiles on every profile page load and should stay cheap, while this is a
-- pile of per-person aggregates that only the card needs. It is also what the
-- Eaters tab will read for many profiles at once, which is why it is a view and
-- not a per-profile function.
--
-- Cost, honestly: this is O(profiles x rankings) with no materialisation — fine
-- at 98 profiles and 272 rankings, and the first thing to materialise when it
-- isn't (same standing concern as category_stats, open issue #10).
create view lunchboxd.profile_card_stats
with (security_invoker = true) as
select
  p.id as user_id,
  p.created_at,
  coalesce(agg.ranking_count, 0) as ranking_count,
  coalesce(agg.review_count, 0) as review_count,
  coalesce(agg.category_count, 0) as category_count,
  coalesce(agg.hearts_given, 0) as hearts_given,
  agg.avg_score,
  coalesce(inv.invented_count, 0) as invented_count,
  coalesce(lr.likes_received, 0) as likes_received,
  coalesce(lg.likes_given, 0) as likes_given,
  best.food as best_food,
  best.score as best_score,
  worst.food as worst_food,
  worst.score as worst_score,
  most.name as top_category,
  most.n as top_category_count,
  kind.name as kindest_category,
  kind.avg_score as kindest_score,
  harsh.name as harshest_category,
  harsh.avg_score as harshest_score
from lunchboxd.profiles p
left join lateral (
  select
    count(*) as ranking_count,
    count(*) filter (where r.review is not null) as review_count,
    count(distinct r.category_id) as category_count,
    count(*) filter (where r.hearted) as hearts_given,
    avg(r.score) as avg_score
  from lunchboxd.rankings r where r.user_id = p.id
) agg on true
left join lateral (
  select count(*) as invented_count from lunchboxd.categories c where c.created_by = p.id
) inv on true
left join lateral (
  select count(*) as likes_received
  from lunchboxd.likes l join lunchboxd.rankings r on r.id = l.ranking_id
  where r.user_id = p.id
) lr on true
left join lateral (
  select count(*) as likes_given from lunchboxd.likes l where l.user_id = p.id
) lg on true
-- Ties break on the older ranking, so a card doesn't reshuffle its own history.
left join lateral (
  select r.food, r.score from lunchboxd.rankings r
  where r.user_id = p.id order by r.score desc, r.created_at asc limit 1
) best on true
left join lateral (
  select r.food, r.score from lunchboxd.rankings r
  where r.user_id = p.id order by r.score asc, r.created_at asc limit 1
) worst on true
left join lateral (
  select c.name::text as name, count(*) as n
  from lunchboxd.rankings r join lunchboxd.categories c on c.id = r.category_id
  where r.user_id = p.id
  group by c.name order by count(*) desc, c.name limit 1
) most on true
-- Kindest and harshest need at least two rankings in the category: with one, a
-- single 5.0 would crown a category the person has barely eaten in, which is
-- the same "sample size of one" problem the leaderboard's Bayesian prior exists
-- to solve. Below the threshold these are null and the card shows a dash.
left join lateral (
  select c.name::text as name, avg(r.score) as avg_score
  from lunchboxd.rankings r join lunchboxd.categories c on c.id = r.category_id
  where r.user_id = p.id
  group by c.name having count(*) >= 2
  order by avg(r.score) desc, c.name limit 1
) kind on true
left join lateral (
  select c.name::text as name, avg(r.score) as avg_score
  from lunchboxd.rankings r join lunchboxd.categories c on c.id = r.category_id
  where r.user_id = p.id
  group by c.name having count(*) >= 2
  order by avg(r.score) asc, c.name limit 1
) harsh on true;

grant select on lunchboxd.profile_card_stats to anon, authenticated;

notify pgrst, 'reload schema';
