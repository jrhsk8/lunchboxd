-- Rankings become editable.
--
-- This reverses a recorded position. data-model.md said the review was "set at
-- insert only; the update grant stays hearted-only, so editing a review means
-- delete and re-log" — which cost the timestamp, the feed position and the
-- heart to fix a typo, in a 2000-character field, on a site whose reference
-- point allows editing freely. Owner-ruled 2026-07-25.
--
-- Edits are silent: no edited_at column and no marker (also owner-ruled). Feed
-- order keys off created_at, which an edit does not touch, so editing cannot
-- re-float a ranking to the top of the activity feed.
--
-- The existing owner-only update policy already covers these columns; only the
-- column grant widens. `user_id` and `category_id` stay ungranted, so a ranking
-- cannot be moved between people or categories from the client.

grant update (hearted, review, score, food) on lunchboxd.rankings to authenticated;

notify pgrst, 'reload schema';
