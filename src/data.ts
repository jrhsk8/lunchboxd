import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type CategoryStat = {
  id: string;
  name: string;
  ranking_count: number;
  ranker_count: number;
  avg_score: number | null;
  last_ranked_at: string | null;
  weighted_score: number | null;
};

export type ProfileMeta = { username: string; is_admin?: boolean; tags?: string[] };

export type Ranking = {
  id: string;
  food: string;
  score: number;
  created_at: string;
  user_id: string;
  profiles: ProfileMeta | null;
  hearted: boolean;
  review: string | null;
};

export type Activity = Ranking & { categories: { name: string } | null };

export type ProfileInfo = {
  id: string;
  username: string;
  created_at: string;
  is_admin: boolean;
  banned_at: string | null;
  tags: string[];
};

export type ProfileRanking = Activity & { category_id: string };

/**
 * A person's totals, computed server-side. The ranking list below them is
 * capped, and deriving these from that array made a heavy user's "lifetime
 * average" silently the average of their most recent page.
 */
export type ProfileStats = {
  ranking_count: number;
  category_count: number;
  hearted_count: number;
  avg_score: number | null;
};

/**
 * What the UI shows when a query fails.
 *
 * Every fetch used to destructure `data` and drop `error`, so a Supabase
 * outage, an expired PostgREST schema cache, or a dead connection all rendered
 * as "no categories yet" — the site reporting emptiness as fact. These strings
 * are deliberately vague about the cause (the user can't act on PGRST106) and
 * specific about what failed.
 */
const FETCH_FAILED = "Couldn't reach the kitchen";

function fail(where: string, error: { message: string } | null): string | null {
  if (!error) return null;
  console.error(`lunchboxd: ${where} failed —`, error.message);
  return FETCH_FAILED;
}

/**
 * One person's public page: their profile row, their totals, and their ranking
 * history. `profile` is undefined while loading, null when no such handle
 * exists. `error` is set when the lookup itself failed, which is a different
 * thing from the handle not existing.
 */
export function useProfile(username: string, version: number) {
  const [profile, setProfile] = useState<ProfileInfo | null | undefined>(undefined);
  const [rankings, setRankings] = useState<ProfileRanking[] | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset to loading only on a handle change; version bumps (realtime, tab
  // focus) refetch in place so the page never flashes.
  useEffect(() => {
    setProfile(undefined);
    setRankings(null);
    setStats(null);
    setError(null);
  }, [username]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let alive = true;
    (async () => {
      // `username` is citext, so this matches regardless of case — #/u/Jack
      // finds `jack`.
      const { data: prof, error: profErr } = await client
        .from('profiles')
        .select('id, username, created_at, is_admin, banned_at, tags')
        .eq('username', username)
        .maybeSingle();
      if (!alive) return;
      if (profErr) {
        setError(fail('profile lookup', profErr));
        return;
      }
      setError(null);
      setProfile(prof ?? null);
      if (!prof) return;

      const [listRes, statRes] = await Promise.all([
        client
          .from('rankings')
          .select(
            'id, food, score, created_at, user_id, hearted, review, category_id, profiles(username, is_admin, tags), categories(name)',
          )
          .eq('user_id', prof.id)
          .order('created_at', { ascending: false })
          .limit(500),
        client
          .from('profile_stats')
          .select('ranking_count, category_count, hearted_count, avg_score')
          .eq('user_id', prof.id)
          .maybeSingle(),
      ]);
      if (!alive) return;
      const err = fail('profile rankings', listRes.error ?? statRes.error);
      if (err) {
        setError(err);
        return;
      }
      setRankings(listRes.data ?? []);
      setStats(statRes.data as ProfileStats | null);
    })();
    return () => {
      alive = false;
    };
  }, [username, version]);

  return { profile, rankings, stats, error };
}

/**
 * The shared board: category leaderboard + site-wide activity feed, refetched
 * together. A realtime subscription on rankings bumps `version` so every open
 * view (including expanded categories) refreshes when anyone ranks.
 */
export function useBoard() {
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    Promise.all([
      supabase.from('category_stats').select('*'),
      supabase
        .from('rankings')
        .select(
          'id, food, score, created_at, user_id, hearted, review, profiles(username, is_admin, tags), categories(name)',
        )
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([statsRes, actRes]) => {
      if (!alive) return;
      const err = fail('board', statsRes.error ?? actRes.error);
      if (err) {
        setError(err);
        // Deliberately not setLoaded(true): an errored board must never fall
        // through to the "no categories yet" empty state.
        return;
      }
      setError(null);
      const rows = (statsRes.data ?? []) as CategoryStat[];
      // Sort by the prior-weighted score, not the raw average: a category
      // invented a minute ago with one 5.0 does not outrank fifty rankings
      // averaging 4.8.
      rows.sort((a, b) => (b.weighted_score ?? -1) - (a.weighted_score ?? -1));
      setStats(rows);
      setActivity(actRes.data ?? []);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('rankings-live')
      .on('postgres_changes', { event: '*', schema: 'lunchboxd', table: 'rankings' }, refresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('realtime channel status:', status);
        }
      });
    // Realtime carries the live case; focus and visibility cover the tab that
    // was asleep when the event fired. There is deliberately no interval —
    // `category_stats` aggregates every ranking in the table, and a poll in
    // every open tab recomputed it site-wide four times a minute forever.
    // Focus and visibilitychange both fire on the same tab switch, so the
    // refetch is debounced to one.
    let pending = 0;
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(pending);
      pending = setTimeout(refresh, 200);
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      client.removeChannel(channel);
      clearTimeout(pending);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [refresh]);

  return { stats, activity, loaded, error, version, refresh };
}

/**
 * One category's stat row looked up by name (via `categories`, whose citext
 * unique makes the URL case-insensitive). `stat` is undefined while loading,
 * null when no such category exists.
 */
export function useCategoryStat(name: string, version: number) {
  const [stat, setStat] = useState<CategoryStat | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStat(undefined);
    setError(null);
  }, [name]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let alive = true;
    (async () => {
      const { data: cat, error: catErr } = await client
        .from('categories')
        .select('id')
        .eq('name', name)
        .maybeSingle();
      if (!alive) return;
      if (catErr) {
        setError(fail('category lookup', catErr));
        return;
      }
      if (!cat) {
        setError(null);
        setStat(null);
        return;
      }
      const { data, error: statErr } = await client
        .from('category_stats')
        .select('*')
        .eq('id', cat.id)
        .maybeSingle();
      if (!alive) return;
      if (statErr) {
        setError(fail('category stats', statErr));
        return;
      }
      setError(null);
      setStat((data as CategoryStat | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [name, version]);

  return { stat, error };
}

/**
 * Rankings whose review contains a given #hashtag, newest first. The DB does a
 * case-insensitive substring prefilter (`ilike %#tag%`, backed by the trigram
 * index); the client then refines with a word-boundary regex so "#tag" doesn't
 * match "#tagged". That boundary rule must stay in step with HASHTAG_RE in
 * ui.tsx — both are covered by src/ui.test.ts.
 */
export function useTagReviews(tag: string, version: number) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = tag.toLowerCase().replace(/[^a-z0-9_]/g, '');

  useEffect(() => {
    setRows(null);
    setError(null);
  }, [tag]);

  useEffect(() => {
    if (!supabase) return;
    if (!clean) {
      setRows([]);
      return;
    }
    const client = supabase;
    let alive = true;
    (async () => {
      const { data, error: err } = await client
        .from('rankings')
        .select(
          'id, food, score, created_at, user_id, hearted, review, profiles(username, is_admin, tags), categories(name)',
        )
        .ilike('review', `%#${clean}%`)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!alive) return;
      if (err) {
        setError(fail('hashtag search', err));
        return;
      }
      setError(null);
      const boundary = new RegExp(`(^|[^a-z0-9_])#${clean}([^a-z0-9_]|$)`, 'i');
      setRows((data ?? []).filter((r) => r.review && boundary.test(r.review)));
    })();
    return () => {
      alive = false;
    };
  }, [clean, version]);

  return { rows, error };
}

/** Everyone's rankings within one category, newest first. */
export function useCategoryRankings(categoryId: string | null, version: number) {
  const [rankings, setRankings] = useState<Ranking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !categoryId) {
      setRankings(null);
      return;
    }
    let alive = true;
    supabase
      .from('rankings')
      .select(
        'id, food, score, created_at, user_id, hearted, review, profiles(username, is_admin, tags)',
      )
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(fail('category rankings', err));
          return;
        }
        setError(null);
        setRankings(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, [categoryId, version]);

  return { rankings, error };
}

/**
 * Every category name, for the rank form's type-ahead. Cheap enough to hold in
 * full: it's one short string per category and the list is already fetched for
 * the board.
 */
export function useCategoryNames(version: number) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase
      .from('categories')
      .select('name')
      .order('name')
      .then(({ data, error }) => {
        if (alive && !error) setNames((data ?? []).map((c) => c.name));
      });
    return () => {
      alive = false;
    };
  }, [version]);
  return names;
}

/** A duplicate ranking, blocked by rankings_one_per_food_idx. */
const DUPLICATE = '23505';

/** Find-or-create the category by name, then log the ranking under it. */
export async function rankFood(opts: {
  userId: string;
  categoryId?: string;
  categoryName?: string;
  food: string;
  score: number;
  hearted: boolean;
  review?: string;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };

  let categoryId = opts.categoryId ?? null;
  if (!categoryId && opts.categoryName) {
    const name = opts.categoryName.trim();
    // citext unique: eq is case-insensitive, so "pizza" finds "Pizza".
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existing) {
      categoryId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from('categories')
        .insert({ name, created_by: opts.userId })
        .select('id')
        .single();
      if (error) {
        // Unique race: someone else invented it between our check and insert.
        const { data: raced } = await supabase
          .from('categories')
          .select('id')
          .eq('name', name)
          .maybeSingle();
        if (!raced) return { error: error.message };
        categoryId = raced.id;
      } else {
        categoryId = created.id;
      }
    }
  }
  if (!categoryId) return { error: 'Pick a category' };

  const { error } = await supabase.from('rankings').insert({
    category_id: categoryId,
    user_id: opts.userId,
    food: opts.food.trim(),
    score: opts.score,
    hearted: opts.hearted,
    review: opts.review?.trim() || null,
  });
  if (!error) return {};
  return {
    error:
      error.code === DUPLICATE
        ? `You've already ranked ${opts.food.trim()} here — edit that ranking instead.`
        : error.message,
  };
}

/**
 * Edit one of your own rankings in place. The column grant covers exactly these
 * four fields, so a ranking can't be moved between people or categories from
 * the client. Edits are silent by design — no marker, and `created_at` doesn't
 * move, so editing can't re-float a ranking up the activity feed.
 */
export async function updateRanking(
  id: string,
  patch: { food?: string; score?: number; review?: string | null; hearted?: boolean },
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const next = {
    ...patch,
    ...(patch.food !== undefined ? { food: patch.food.trim() } : {}),
    ...(patch.review !== undefined ? { review: patch.review?.trim() || null } : {}),
  };
  const { error } = await supabase.from('rankings').update(next).eq('id', id);
  if (!error) return {};
  return {
    error:
      error.code === DUPLICATE
        ? "You've already ranked that food in this category."
        : error.message,
  };
}

/** Admin-only (enforced server-side): rename a category in place. */
export async function renameCategory(id: string, name: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const next = name.trim();
  const { error } = await supabase.rpc('rename_category', { cat: id, new_name: next });
  if (!error) return {};
  return {
    error:
      error.code === DUPLICATE
        ? `"${next}" already exists — merge into it instead.`
        : error.message,
  };
}

/**
 * Admin-only (enforced server-side): move every ranking from `source` into
 * `target` and delete `source`. The averages recompute; there is no undo.
 */
export async function mergeCategories(source: string, target: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.rpc('merge_categories', { source, target });
  return error ? { error: error.message } : {};
}

/**
 * Flip the heart on one of your own rankings. Returns the error rather than
 * swallowing it: the caller flips optimistically, so a rejected write (banned
 * account, expired session) has to be able to put the glyph back.
 */
export async function setHearted(rankingId: string, hearted: boolean): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('rankings').update({ hearted }).eq('id', rankingId);
  return error ? { error: error.message } : {};
}

export async function deleteRanking(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('rankings').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

/**
 * Change your own handle (RLS restricts the update to your row). The old handle
 * is released for anyone to claim; a collision here is a plain unique violation
 * — the signup trigger's name-2 fallback doesn't apply to renames. Handles are
 * citext, so "jack" collides with "Jack".
 */
export async function renameProfile(userId: string, username: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const name = username.trim();
  const { error } = await supabase.from('profiles').update({ username: name }).eq('id', userId);
  if (!error) return {};
  return { error: handleError(name, error) };
}

/**
 * The three ways a handle gets refused, in the register the rest of the form
 * uses. The charset and reserved-name rules are check constraints, so they
 * arrive as one undifferentiated 23514 — the message covers both.
 */
function handleError(name: string, error: { code?: string; message: string }): string {
  if (error.code === DUPLICATE) {
    return `"${name}" is already claimed — even signed-out guests keep their handles.`;
  }
  if (error.code === '23514') {
    return 'Handles run 2 to 24 characters, using letters, numbers, hyphens and underscores. A few names are reserved.';
  }
  return error.message;
}

/** Replace your own flair tags (server enforces the allowed roster). */
export async function setProfileTags(userId: string, tags: string[]): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('profiles').update({ tags }).eq('id', userId);
  return error ? { error: error.message } : {};
}

/**
 * Admin-only (enforced server-side): bans the profile, deleting their rankings
 * and every category they invented (with everyone's rankings in those
 * categories).
 */
export async function banProfile(targetId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.rpc('ban_profile', { target: targetId });
  return error ? { error: error.message } : {};
}
