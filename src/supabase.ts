import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when env is missing — the app renders setup instructions instead. */
export const supabase: SupabaseClient<any, any, 'lunchboxd'> | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // All lunchboxd tables live in their own schema: in production the
        // Supabase project is shared with gambdle.net.
        db: { schema: 'lunchboxd' },
      })
    : null;
