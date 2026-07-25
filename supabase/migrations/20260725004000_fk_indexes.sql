-- Postgres does not index foreign key columns automatically, and init only
-- created two indexes, both keyed on category/created_at.
--
-- rankings.user_id had none, so every profile page load was a sequential scan,
-- as was `delete from rankings where user_id = target` inside ban_profile.
-- categories.created_by had none, so the category delete in ban_profile was
-- too. The composite on (user_id, created_at desc) matches the profile page's
-- sort, so it covers the read as well as the delete.

create index rankings_user_idx on lunchboxd.rankings (user_id, created_at desc);
create index categories_creator_idx on lunchboxd.categories (created_by);
