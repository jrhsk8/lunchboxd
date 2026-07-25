-- The two foreign keys 20260725004000_fk_indexes.sql would have covered, had
-- `notifications` existed yet. It shipped five migrations later with neither.
--
-- ranking_id is the one that costs: the trigger behind every unlike and every
-- ranking edit deletes by it, so each of those was a sequential scan over the
-- whole table. actor_id is deleted by when an account is banned, and is the
-- side of the notifications embed PostgREST resolves by constraint name.
--
-- Plain `create index`, not `concurrently`: apply.js runs a migration in one
-- transaction and concurrent index builds cannot run inside one. The table is
-- small and the write lock lasts milliseconds.

create index notifications_ranking_idx on lunchboxd.notifications (ranking_id);
create index notifications_actor_idx on lunchboxd.notifications (actor_id);
