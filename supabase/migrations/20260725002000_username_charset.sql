-- Handles get a character set and a reserved list.
--
-- The only rule until now was `char_length between 2 and 24`, so a handle could
-- hold spaces, slashes, emoji, zero-width characters, RTL overrides, and
-- Cyrillic look-alikes (аdmin with a Cyrillic а). Nothing stopped anyone
-- claiming `admin`, `lunchboxd` or `moderator` either — and the handle sits in
-- the same visual row as the real Admin badge, so impersonation was the cheap
-- attack against the entire identity model.
--
-- Eight existing handles used spaces or punctuation and are renamed here
-- (owner-ruled 2026-07-25: strict, rename rather than grandfather). Spaces
-- become underscores, disallowed characters are dropped, and a collision takes
-- the `-2` suffix the signup trigger already uses:
--
--   LeBron James          -> LeBron_James
--   Living Trash          -> Living_Trash
--   LoveMyWife'sCooking   -> LoveMyWifesCooking
--   Zac.h                 -> Zac_h
--   Doug or Red or smth   -> Doug_or_Red_or_smth
--   Joel ♊                -> Joel-2          ("Joel" is a different account)
--   Hall & Oats           -> Hall_Oats
--   Pickle lover          -> Pickle_lover

update lunchboxd.profiles set username = 'LeBron_James'        where username = 'LeBron James';
update lunchboxd.profiles set username = 'Living_Trash'        where username = 'Living Trash';
update lunchboxd.profiles set username = 'LoveMyWifesCooking'  where username = 'LoveMyWife''sCooking';
update lunchboxd.profiles set username = 'Zac_h'               where username = 'Zac.h';
update lunchboxd.profiles set username = 'Doug_or_Red_or_smth' where username = 'Doug or Red or smth';
update lunchboxd.profiles set username = 'Joel-2'              where username = 'Joel ♊';
update lunchboxd.profiles set username = 'Hall_Oats'           where username = 'Hall & Oats';
update lunchboxd.profiles set username = 'Pickle_lover'        where username = 'Pickle lover';

alter table lunchboxd.profiles
  add constraint profiles_username_charset
    check (username::text ~ '^[A-Za-z0-9_-]+$');

-- Names that would let an account pass for the site or its staff. Compared
-- case-insensitively; the column is citext but lower() is explicit here so the
-- intent survives a future type change.
alter table lunchboxd.profiles
  add constraint profiles_username_not_reserved
    check (lower(username::text) not in (
      'admin', 'administrator', 'lunchboxd', 'moderator', 'mod', 'staff',
      'support', 'help', 'root', 'system', 'official', 'api', 'www'
    ));

notify pgrst, 'reload schema';
