-- Flair is either/or: you ride Peloton or you ride Zwift, not both.
-- (Roster membership is already enforced by profiles_tags_allowed.)

update lunchboxd.profiles set tags = '{}' where cardinality(tags) > 1;

alter table lunchboxd.profiles
  add constraint profiles_tags_single check (cardinality(tags) <= 1);
