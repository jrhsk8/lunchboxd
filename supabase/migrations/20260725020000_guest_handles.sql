-- Guests get a serial handle, not a name of their choosing.
--
-- A guest identity is one refresh token in one browser's localStorage: no
-- email, no password, nothing server-side that proves ownership. It dies with
-- cleared site data, a second device, or Safari's 7-day eviction of
-- script-writable storage — and the handle went with it permanently, because a
-- handle belongs to its account forever (decisions.md 2026-07-23). Two days in,
-- two people had already asked for a lost handle back, and the only fix was
-- deleting their old account by hand.
--
-- Owner-ruled 2026-07-25: **a scarce name is only ever held by an account that
-- can be recovered.** An anonymous signup gets `guest-<6 hex>` whatever it asks
-- for, and can't rename until it attaches an email — at which point GoTrue
-- flips `auth.users.is_anonymous` to false and the rename unlocks by itself.
--
-- The 47 guests already holding picked names keep them (grandfathered: renaming
-- live accounts to serial numbers is a different order of hostile from the
-- charset rewrite in 20260725002000). They are frozen on that handle until they
-- attach an email, which is the outcome this whole change is arguing for.

-- The username still comes from signup metadata, but only for an account that
-- can be signed back into. Anonymous signups are given a serial name, and so is
-- any signup that asks for one of the reserved `guest-*` names.
create or replace function lunchboxd.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hex text := replace(new.id::text, '-', '');
  prefix text := case when new.is_anonymous then 'guest-' else 'eater-' end;
  requested text;
  base text;
  candidate text;
  n int := 0;
begin
  requested := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if new.is_anonymous or requested is null or lower(requested) like 'guest-%' then
    base := prefix || substr(hex, 1, 6);
  else
    base := requested;
  end if;

  -- Never raise: a raise here fails the entire auth signup and locks the handle
  -- for good, which is the bug 20260724150000 exists to fix.
  candidate := base;
  loop
    begin
      insert into lunchboxd.profiles (id, username) values (new.id, candidate);
      return new;
    exception when unique_violation then
      n := n + 1;
      if n > 20 then
        -- Pathological pileup. `n` stays in the name so this can't settle on a
        -- single colliding candidate and spin forever; 10 hex characters of a
        -- v4 uuid do the actual uniqueness work.
        candidate := prefix || substr(hex, 1, 10) || '-' || n;
      else
        candidate := base || '-' || n;
      end if;
    end;
  end loop;
end;
$$;

-- The rename gate. This is a trigger rather than a check constraint or a
-- widening of the RLS policy for two reasons: a constraint banning `guest-*`
-- would reject the rows the signup trigger itself writes, and an RLS policy
-- applies to the whole update, which would take `tags` down with it — guests
-- keep their flair, they just can't take a name.
--
-- It reads `auth.users.is_anonymous` rather than the JWT's `is_anonymous`
-- claim, which is why it's SECURITY DEFINER. The claim is stale until the
-- session refreshes, so a guest who had just confirmed their email would have
-- been told to add the email they had already added.
create or replace function lunchboxd.enforce_handle_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is not distinct from old.username then
    return new;
  end if;

  -- Admin surgery from the SQL console has no auth.uid(); it is not the thing
  -- being policed here.
  if (select auth.uid()) is null then
    return new;
  end if;

  if lower(new.username::text) like 'guest-%' then
    raise exception 'Handles that start with "guest-" belong to guest accounts.';
  end if;

  if exists (select 1 from auth.users u where u.id = new.id and u.is_anonymous) then
    raise exception 'Add an email to this account first. A handle you pick is yours to keep, so it has to be attached to something you can sign back in with.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_handle_rules on lunchboxd.profiles;
create trigger profiles_handle_rules
  before update of username on lunchboxd.profiles
  for each row execute function lunchboxd.enforce_handle_rules();

notify pgrst, 'reload schema';
