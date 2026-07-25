-- One person, one score per food per category.
--
-- Nothing stopped an account logging "Pizza" fifty times at 5.0: the average
-- was a plain avg() over all rankings with no uniqueness anywhere. Combined
-- with unlimited anonymous sign-ups, the top of the board was whatever anyone
-- most recently decided it should be.
--
-- The key is case-insensitive and trimmed, because "Pizza" and "pizza " are the
-- same food and the case-sensitive version would be a one-keystroke bypass.
--
-- Four duplicate groups existed, each with an identical score in every row —
-- accidental double-submits rather than stuffing. The earliest row of each
-- group survives; the other six are deleted. A full backup was taken first.

delete from lunchboxd.rankings r
where exists (
  select 1 from lunchboxd.rankings keep
  where keep.user_id = r.user_id
    and keep.category_id = r.category_id
    and lower(btrim(keep.food)) = lower(btrim(r.food))
    and (keep.created_at, keep.id) < (r.created_at, r.id)
);

create unique index rankings_one_per_food_idx
  on lunchboxd.rankings (user_id, category_id, lower(btrim(food)));
