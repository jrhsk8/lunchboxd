-- The Letterboxd top four: up to four of your own rankings pinned to your
-- profile.
--
-- A slot number on the ranking itself rather than a separate favourites table,
-- for the same reason `hearted` is a flag on the ranking (decisions.md
-- 2026-07-23): what gets pinned IS a ranking, food is not a first-class unit
-- here (#34), and the existing cascade on a deleted ranking takes its pin with
-- it for free.
--
-- Two guards keep the set a *four*: the check bounds a slot to 1-4, and the
-- partial unique index allows one ranking per slot per person. Nobody can hold
-- five, and two tabs racing for the same slot lose one of them to a 23505
-- rather than both landing.

alter table lunchboxd.rankings
  add column top_rank smallint
    constraint rankings_top_rank_range check (top_rank is null or top_rank between 1 and 4);

create unique index rankings_one_per_top_slot_idx
  on lunchboxd.rankings (user_id, top_rank)
  where top_rank is not null;

-- Same shape as the editable-rankings grant (20260725009000): the owner-only
-- update policy already covers the row, so only the column list widens.
-- `user_id` and `category_id` stay ungranted — a pin can't move a ranking
-- between people or categories.
grant update (hearted, review, score, food, top_rank) on lunchboxd.rankings to authenticated;

notify pgrst, 'reload schema';
