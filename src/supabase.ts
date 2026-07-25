import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null when env is missing — the app renders setup instructions instead.
 *
 * `Database` is generated from the live schema, so a renamed column or a
 * dropped select field is a type error rather than a runtime surprise.
 * Regenerate after every migration — see docs/meta/deploy.md.
 */
export const supabase: SupabaseClient<Database, 'lunchboxd'> | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // All lunchboxd tables live in their own schema: in production the
        // Supabase project is shared with gambdle.net.
        db: { schema: 'lunchboxd' },
      })
    : null;
