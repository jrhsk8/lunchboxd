-- Log the same food as many times as you actually eat it, up to ten a day.
--
-- This drops `rankings_one_per_food_idx` (20260725006000), reversing the
-- one-row-per-person-per-food-per-category rule the same day it shipped.
-- Owner-ruled after a user report: someone had several Zyns over a day and the
-- site refused every one after the first, showing them a raw Postgres
-- constraint error to do it. A site for logging what you eat has to let you log
-- what you ate.
--
-- The rule it replaces was there to stop one account logging "Pizza" fifty
-- times at 5.0 to move the board. That hole is already closed by the other half
-- of the same batch: `category_stats.avg_score` averages each person's scores
-- FIRST and then averages those, so a category counts a person once however
-- many rankings they file. Ten identical 5.0s leave that person's own average
-- at 5.0 and move the category exactly as far as one did. The index was, by the
-- time it landed, guarding a door the view had already locked.
--
-- Two guards survive it, both in one BEFORE INSERT trigger, because what the
-- index was really buying by then was protection from mashing rather than from
-- stuffing:
--
--   * the stutter — an identical food AND score from the same person in the
--     same category within a minute is a double-tap, not a second helping.
--     Four such groups (six rows) existed in the live data when the index was
--     created;
--   * the cap — ten rankings of the same food, by the same person, in the same
--     category, per rolling 24 hours. Owner-ruled. Rolling rather than calendar
--     because the server keeps UTC and the people using this site do not, so a
--     calendar day would reset mid-afternoon for them.
--
-- Note for anyone thinking of putting the index back: it can only be recreated
-- while no duplicates exist, and from now on there will be.

drop index lunchboxd.rankings_one_per_food_idx;

create function lunchboxd.check_repeat_rankings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Ten of the same thing in a day. A number, not a principle: it exists to
  -- bound a runaway script, not to referee anyone's lunch.
  daily_cap constant int := 10;
  same_food int;
begin
  if exists (
    select 1 from lunchboxd.rankings r
    where r.user_id = new.user_id
      and r.category_id = new.category_id
      and lower(btrim(r.food)) = lower(btrim(new.food))
      and r.score = new.score
      and r.created_at > now() - interval '1 minute'
  ) then
    -- These are raised as P0001, which the client passes through to the person
    -- verbatim, so they are written as sentences rather than diagnostics.
    raise exception 'You just logged that one. If you really are having another, give it a minute.';
  end if;

  select count(*) into same_food
  from lunchboxd.rankings r
  where r.user_id = new.user_id
    and r.category_id = new.category_id
    and lower(btrim(r.food)) = lower(btrim(new.food))
    and r.created_at > now() - interval '24 hours';

  if same_food >= daily_cap then
    raise exception 'That is ten of those in a day, which is the limit. The rest will have to go unrecorded.';
  end if;

  return new;
end;
$$;

create trigger rankings_check_repeats
  before insert on lunchboxd.rankings
  for each row execute function lunchboxd.check_repeat_rankings();

notify pgrst, 'reload schema';
