-- A ban is supposed to stop the account writing. The insert policies on
-- rankings and categories check `banned_at is null`; the profiles update policy
-- never did, so a banned account could keep renaming itself and re-adding the
-- flair that ban_profile explicitly clears. The profile page said the account
-- was banned while the account cycled handles.
--
-- The column grant (username, tags) already stopped the serious escalations —
-- a banned user could not set is_admin or clear their own banned_at — so this
-- closes an intent gap rather than a hole.

drop policy "users edit own profile" on lunchboxd.profiles;
create policy "users edit own profile" on lunchboxd.profiles
  for update using (
    (select auth.uid()) = id
    and banned_at is null
  ) with check (
    (select auth.uid()) = id
    and banned_at is null
  );

notify pgrst, 'reload schema';
