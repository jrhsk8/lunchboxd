-- The hashtag page prefilters server-side with `review ilike '%#tag%'`. A
-- leading-wildcard ilike cannot use a btree index, so every hashtag view
-- scanned the whole rankings table — the limit(200) does not help, because the
-- scan happens before the limit. The client's word-boundary regex refinement is
-- the right call, but the cost was already paid by then.
--
-- pg_trgm makes the substring prefilter indexable. Deliberately the cheap fix:
-- extracting hashtags into their own table at insert would reverse the ruling
-- in app-shell.md that hashtags are "purely a render/route convention: no
-- schema change", and that ruling still stands.

create extension if not exists pg_trgm;

create index rankings_review_trgm_idx on lunchboxd.rankings using gin (review gin_trgm_ops);
