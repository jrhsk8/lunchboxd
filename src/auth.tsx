import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setUsername(null);
      return;
    }
    let alive = true;
    const client = supabase;
    const user = session.user;
    (async () => {
      // The profile row is created by a DB trigger; on a brand-new account it
      // can land a beat after the session does, so retry briefly.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data } = await client
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .maybeSingle();
        if (!alive) return;
        if (data?.username) {
          setUsername(data.username);
          return;
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      if (alive) setUsername((user.user_metadata?.username as string) ?? 'eater');
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  return { session, username };
}

const input =
  'w-full rounded-lg border border-edge bg-field px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-clay focus:outline-none';
const btnPrimary =
  'cursor-pointer rounded-lg border border-transparent bg-clay px-4 py-2.5 text-sm font-bold text-field transition-colors hover:bg-clay-hover disabled:cursor-default disabled:opacity-40';

/** Sign-in card: guest-first (pick a handle, start ranking), magic link second. */
export function SignInCard() {
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startAsGuest() {
    if (!supabase || handle.trim().length < 2) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { username: handle.trim() } },
    });
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
        Categories and averages are shared with everyone. Pick a handle to start ranking.
      </p>
      <label className="flex flex-col gap-1.5 text-[11px] font-semibold tracking-wider text-dim uppercase">
        Handle
        <input
          className={input}
          placeholder="hotdog_hank"
          maxLength={24}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') startAsGuest();
          }}
        />
      </label>
      <button
        type="button"
        className={btnPrimary}
        disabled={busy || handle.trim().length < 2}
        onClick={startAsGuest}
      >
        Start ranking
      </button>

      <div className="flex items-center gap-3 text-[10px] tracking-wider text-faint uppercase">
        <span className="h-px flex-1 bg-edge" />
        or keep your account
        <span className="h-px flex-1 bg-edge" />
      </div>

      <div className="flex gap-2">
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
          className="shrink-0 cursor-pointer rounded-lg border border-edge bg-raised px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-edge-hover hover:bg-raised-hover disabled:cursor-default disabled:opacity-40"
          disabled={busy || !email.includes('@')}
          onClick={sendMagicLink}
        >
          Email link
        </button>
      </div>

      {status && (
        <p className="m-0 rounded-lg border-l-4 border-clay bg-raised px-3 py-2 text-xs text-dim">
          {status}
        </p>
      )}
    </div>
  );
}
