-- The likes gate reads the account, not the token.
--
-- `20260725014000_likes.sql` gated the insert policy on the JWT's
-- `is_anonymous` claim. That claim is minted at sign-in and stays stale until
-- the session refreshes, so somebody who had just confirmed their email would
-- be told to attach the email they had already attached — the identical trap
-- `enforce_handle_rules` (20260725020000) had already been written to avoid,
-- an hour earlier, with the identical fix.
--
-- So: one SECURITY DEFINER helper, used by both kinds of gate from here on.
-- `authenticated` cannot select `auth.users` itself, which is the whole reason
-- a policy can't simply join to it; the definer function is the seam.

create function lunchboxd.caller_has_email()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid()) and not u.is_anonymous
  );
$$;

revoke all on function lunchboxd.caller_has_email() from public;
grant execute on function lunchboxd.caller_has_email() to authenticated;

drop policy "email accounts like other people's rankings" on lunchboxd.likes;
create policy "email accounts like other people's rankings" on lunchboxd.likes
  for insert with check (
    (select auth.uid()) = user_id
    and lunchboxd.caller_has_email()
    and (select banned_at is null from lunchboxd.profiles where id = (select auth.uid()))
    -- Not your own ranking: that is what `hearted` is for.
    and (select r.user_id from lunchboxd.rankings r where r.id = ranking_id) <> (select auth.uid())
  );

notify pgrst, 'reload schema';
