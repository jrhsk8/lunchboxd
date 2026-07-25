-- The Eaters tab: everyone who has actually eaten, with their calling card.
--
-- A view rather than a client-side join, for two reasons that are really one.
-- The tab shows 24 of 71 and offers four sort orders (recently active, most
-- rankings, most likes, A–Z); sorting client-side would mean fetching all 71
-- profiles and their whole card stats to draw 24, and the cap would be
-- decorative. With this, the tab is one `order` + `range` and the cap is real.
--
-- It also carries what `profile_card_stats` deliberately doesn't: the handle,
-- the badges, and the three chosen slots. That view answers "what are this
-- person's numbers"; this one answers "who is here, and what does their card
-- say" — which is a different question, and the one the tab asks.
--
-- security_invoker, like every other view here: RLS on the underlying tables
-- decides what a caller sees, rather than the view's owner.

drop view if exists lunchboxd.eaters;

create view lunchboxd.eaters
with (security_invoker = true) as
select
  p.id as user_id,
  p.username::text as username,
  p.is_admin,
  p.is_supporter,
  p.tags,
  p.card_slot_1,
  p.card_slot_2,
  p.card_slot_3,
  p.card_accent,
  -- Every column `profile_card_stats` has, spelled out rather than `s.*`: a
  -- card can show any of the fourteen stats in the vocabulary, so a subset
  -- here would render a dash for somebody who had chosen the one column that
  -- was left out. Named explicitly because a view built on `select *` freezes
  -- its column list at creation anyway — the star is a lie about staying in
  -- step, not a shortcut.
  s.created_at,
  s.ranking_count,
  s.review_count,
  s.category_count,
  s.hearts_given,
  s.avg_score,
  s.invented_count,
  s.likes_received,
  s.likes_given,
  s.best_food,
  s.best_score,
  s.worst_food,
  s.worst_score,
  s.top_category,
  s.top_category_count,
  s.kindest_category,
  s.kindest_score,
  s.harshest_category,
  s.harshest_score,
  -- The default sort. Not in profile_card_stats because no card stat needs it:
  -- "eating since" is the profile's created_at, which is when somebody signed
  -- up, not when they last showed up.
  last.at as last_ranked_at
from lunchboxd.profiles p
join lunchboxd.profile_card_stats s on s.user_id = p.id
left join lateral (
  select max(r.created_at) as at from lunchboxd.rankings r where r.user_id = p.id
) last on true
-- Anyone who has ever ranked, and nobody else. A card for a profile with no
-- rankings is a dash in every slot, and 32 of the 103 profiles are signups that
-- never logged anything. Banned accounts fall out of this for free rather than
-- by a filter somebody has to remember: `ban_profile` deletes the target's
-- rankings, so the count is zero and the row is gone.
where s.ranking_count > 0;

grant select on lunchboxd.eaters to anon, authenticated;

notify pgrst, 'reload schema';
