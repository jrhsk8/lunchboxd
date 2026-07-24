-- The flair roster gains "runner" (still one tag at a time via
-- profiles_tags_single).

alter table lunchboxd.profiles
  drop constraint profiles_tags_allowed,
  add constraint profiles_tags_allowed check (tags <@ array['peloton', 'zwift', 'runner']);

notify pgrst, 'reload schema';
