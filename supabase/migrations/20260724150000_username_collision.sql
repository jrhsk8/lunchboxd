-- A signed-out guest account permanently owns its username, so a new signup
-- with the same handle used to make the profile trigger raise, which failed
-- the entire auth signup ("Database error saving new user") and locked the
-- handle forever. Now collisions fall back to name-2, name-3, ... instead of
-- failing; the client also pre-checks availability for a friendly message.

create or replace function lunchboxd.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    'eater-' || substr(replace(new.id::text, '-', ''), 1, 6)
  );
  candidate := base;
  loop
    begin
      insert into lunchboxd.profiles (id, username) values (new.id, candidate);
      return new;
    exception when unique_violation then
      n := n + 1;
      if n > 20 then
        -- Pathological pileup: fall back to a unique generated handle.
        candidate := 'eater-' || substr(replace(new.id::text, '-', ''), 1, 6);
      else
        candidate := base || '-' || n;
      end if;
    end;
  end loop;
end;
$$;
