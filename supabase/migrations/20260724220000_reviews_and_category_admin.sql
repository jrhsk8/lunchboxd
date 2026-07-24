-- Optional review text on a ranking (Letterboxd-style), plus admin category
-- surgery: rename in place, or merge one category into another to tidy the
-- communal namespace ("Pizza" vs "pizza slices" duplicates).

alter table lunchboxd.rankings
  add column review text
    constraint rankings_review_length check (review is null or char_length(review) between 1 and 2000);

-- Like ban_profile: SECURITY DEFINER functions with an in-body admin check,
-- rather than broad update/delete grants on categories.

create function lunchboxd.rename_category(cat uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from lunchboxd.profiles
    where id = (select auth.uid()) and is_admin
  ) then
    raise exception 'only admins can rename categories';
  end if;
  update lunchboxd.categories set name = trim(new_name) where id = cat;
end;
$$;

create function lunchboxd.merge_categories(source uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from lunchboxd.profiles
    where id = (select auth.uid()) and is_admin
  ) then
    raise exception 'only admins can merge categories';
  end if;
  if source = target then
    raise exception 'a category cannot be merged into itself';
  end if;
  update lunchboxd.rankings set category_id = target where category_id = source;
  delete from lunchboxd.categories where id = source;
end;
$$;

revoke all on function lunchboxd.rename_category(uuid, text) from public;
grant execute on function lunchboxd.rename_category(uuid, text) to authenticated;
revoke all on function lunchboxd.merge_categories(uuid, uuid) from public;
grant execute on function lunchboxd.merge_categories(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
