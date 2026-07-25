import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import { btnPrimary, input as sharedInput, inputSmall } from './ui';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Bumped after a rename so the header handle doesn't go stale.
  const [profileVersion, setProfileVersion] = useState(0);
  const refreshProfile = useCallback(() => setProfileVersion((v) => v + 1), []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setUsername(null);
      setIsAdmin(false);
      return;
    }
    let alive = true;
    const user = session.user;
    (async () => {
      // The profile row is created by a DB trigger; on a brand-new account it
      // can land a beat after the session does, so retry briefly.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data } = await supabase
          .from('profiles')
          .select('username, is_admin')
          .eq('id', user.id)
          .maybeSingle();
        if (!alive) return;
        if (data?.username) {
          setUsername(data.username);
          setIsAdmin(Boolean(data.is_admin));
          return;
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      // Deliberately gives up rather than guessing. The old fallback used the
      // handle asked for at signup, or the literal 'eater' — and the header
      // wraps whatever this returns in a link to that profile, so a guess sent
      // people to a stranger's page or to one that doesn't exist. Null renders
      // the header's placeholder, which is the honest answer.
    })();
    return () => {
      alive = false;
    };
  }, [session, profileVersion]);

  return { session, username, isAdmin, refreshProfile };
}

// The shared control idioms, plus the full-width the auth cards want.
const input = `w-full ${sharedInput}`;

/**
 * The one thing a guest account is missing: an email. Attaching one and
 * confirming it makes the account recoverable by magic link on any device, and
 * — since 2026-07-25 — is what unlocks picking a handle instead of wearing the
 * serial number the signup trigger hands out.
 */
export function KeepAccount() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!supabase || !email.includes('@')) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    );
    setBusy(false);
    if (error) {
      // Kept in the open form rather than collapsing it: the address is still
      // in the field, so the fix is usually one character away.
      console.error('lunchboxd: add email failed —', error.message);
      setFailed(true);
      return;
    }
    setFailed(false);
    setStatus(
      'Confirmation sent. Click the link in your email and the account is yours for keeps — then you can pick a handle from your profile.',
    );
    setOpen(false);
  }

  if (!open) {
    return (
      <span className="flex items-center gap-2">
        {status && <span className="max-w-64 text-[11px] text-dim">{status}</span>}
        {!status && (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-xs whitespace-nowrap text-clay hover:text-clay-hover"
            title="Attach an email so you can sign back in on any device — and pick a handle instead of a serial number"
            onClick={() => setOpen(true)}
          >
            Add email
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        className={inputSmall}
        type="email"
        placeholder="you@example.com"
        value={email}
        autoFocus
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        className="cursor-pointer rounded border border-edge bg-raised px-2 py-1 text-xs font-semibold text-ink hover:bg-raised-hover disabled:opacity-40"
        disabled={busy || !email.includes('@')}
        onClick={save}
      >
        Save
      </button>
      {failed && <span className="text-[11px] text-bad">That didn't send. Check the address.</span>}
    </span>
  );
}

/** Sign-in card: guest-first (one click, serial handle), magic link second. */
export function SignInCard() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // No handle field, and no availability pre-check to go with it: a guest is
  // named `guest-<hex>` by the signup trigger whatever the client asks for
  // (owner-ruled 2026-07-25 — a name nobody can hand back shouldn't be held by
  // an account nobody can recover). Picking one is what an email buys.
  async function startAsGuest() {
    if (!supabase) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setStatus(error.message);
    setBusy(false);
  }

  async function sendMagicLink() {
    if (!supabase || !email.includes('@')) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    setStatus(error ? error.message : 'Check your email for the sign-in link.');
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm leading-relaxed text-dim">
        Categories and averages are shared with everyone. You can start ranking straight away.
      </p>
      <button type="button" className={btnPrimary} disabled={busy} onClick={startAsGuest}>
        Start ranking
      </button>
      <p className="m-0 -mt-2 text-[11px] leading-relaxed text-faint">
        Guests eat under a serial number &mdash; guest-4f2a1 and the like. Add an email whenever you
        like and you can pick a handle that survives a new browser.
      </p>

      <div className="flex items-center gap-3 text-[10px] tracking-wider text-faint uppercase">
        <span className="h-px flex-1 bg-edge" />
        already have an account?
        <span className="h-px flex-1 bg-edge" />
      </div>

      {/* Stacks on phones so the button keeps its full label instead of
          squeezing the email field down to a few characters. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={input}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendMagicLink();
          }}
        />
        <button
          type="button"
          className="w-full cursor-pointer rounded-lg border border-edge bg-raised px-3 py-2 text-sm font-semibold whitespace-nowrap text-ink transition-colors hover:border-edge-hover hover:bg-raised-hover disabled:cursor-default disabled:opacity-40 sm:w-auto sm:shrink-0"
          disabled={busy || !email.includes('@')}
          onClick={sendMagicLink}
        >
          Send sign-in link
        </button>
      </div>
      <p className="m-0 -mt-2 text-[11px] leading-relaxed text-faint">
        No password — we email you a link. An address we haven&rsquo;t seen before starts a new
        account.
      </p>

      {status && (
        <p className="m-0 rounded-lg border-l-4 border-clay bg-raised px-3 py-2 text-xs text-dim">
          {status}
        </p>
      )}
    </div>
  );
}
