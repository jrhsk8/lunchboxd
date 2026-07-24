-- Hearts reworked to true Letterboxd semantics: a heart is something you put
-- on YOUR OWN ranking ("loved it", independent of the score), not a like on
-- other people's. The likes table goes away; hearted lives on the ranking.

drop table lunchboxd.likes;

alter table lunchboxd.rankings add column hearted boolean not null default false;

-- Owners may edit only the heart flag on their own rankings.
grant update (hearted) on lunchboxd.rankings to authenticated;
create policy "users edit own rankings" on lunchboxd.rankings
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
