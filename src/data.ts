import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type CategoryStat = {
  id: string;
  name: string;
  ranking_count: number;
  ranker_count: number;
  avg_score: number | null;
  last_ranked_at: string | null;
};

export type Ranking = {
  id: string;
  food: string;
  score: number;
  created_at: string;
  user_id: string;
  profiles: { username: string } | null;
  likes: { user_id: string }[];
};

export type Activity = Ranking & { categories: { name: string } | null };

/**
 * The shared board: category leaderboard + site-wide activity feed, refetched
 * together. A realtime subscription on rankings bumps `version` so every
 * open view (including expanded categories) refreshes when anyone ranks.
 */
export function useBoard() {
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    Promise.all([
      supabase.from('category_stats').select('*'),
      supabase
        .from('rankings')
        // profiles must name its FK: likes creates a second rankings<->profiles
        // path, which makes a bare profiles() embed ambiguous (PGRST201).
        .select(
          'id, food, score, created_at, user_id, profiles!rankings_user_id_fkey(username), categories(name), likes(user_id)',
        )
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([statsRes, actRes]) => {
      if (!alive) return;
      const rows = (statsRes.data ?? []) as CategoryStat[];
      rows.sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));
      setStats(rows);
      setActivity((actRes.data ?? []) as unknown as Activity[]);
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
    // Realtime is an enhancement, not the source of truth: also refetch on a
    // slow poll and whenever the tab regains focus.
    const interval = setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      client.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  return { stats, activity, loaded, version, refresh };
}

/** Everyone's rankings within one category, newest first. */
export function useCategoryRankings(categoryId: string | null, version: number) {
  const [rankings, setRankings] = useState<Ranking[] | null>(null);

  useEffect(() => {
    if (!supabase || !categoryId) {
      setRankings(null);
      return;
    }
    let alive = true;
    supabase
      .from('rankings')
      .select('id, food, score, created_at, user_id, profiles!rankings_user_id_fkey(username), likes(user_id)')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (alive) setRankings((data ?? []) as unknown as Ranking[]);
      });
    return () => {
      alive = false;
    };
  }, [categoryId, version]);

  return rankings;
}

/** Find-or-create the category by name, then log the ranking under it. */
export async function rankFood(opts: {
  userId: string;
  categoryId?: string;
  categoryName?: string;
  food: string;
  score: number;
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
  });
  return error ? { error: error.message } : {};
}

/** Give or take back a heart on someone's ranking. */
export async function toggleLike(rankingId: string, userId: string, liked: boolean): Promise<void> {
  if (!supabase) return;
  if (liked) {
    await supabase.from('likes').delete().eq('ranking_id', rankingId).eq('user_id', userId);
  } else {
    await supabase.from('likes').insert({ ranking_id: rankingId, user_id: userId });
  }
}

export async function deleteRanking(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('rankings').delete().eq('id', id);
}
