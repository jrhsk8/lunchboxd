/**
 * Every query and every write, as hooks and plain async functions. Nothing in
 * here renders, and nothing outside here talks to Supabase.
 *
 * The two rules the file exists to keep. **Errors are returned, never dropped**
 * — a fetch that swallows its error renders emptiness as fact, which is what
 * `LoadError` and `writeError` exist to prevent. And **the board's `version`
 * counter is the refresh mechanism**: realtime, tab focus and every successful
 * write bump it, and every hook takes it as an argument so one bump refetches
 * whatever is on screen. See data-model.md before changing either.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { cardStatsFrom, type CardStats } from './calling-card';
import type { Database } from './database.types';
import { supabase } from './supabase';
import { cleanHashtag, nextTopSlot, PG, writeError, type WriteError } from './text';

/** A row of one of the schema's views, as the generator describes it. */
type ViewRow<V extends keyof Database['lunchboxd']['Views']> =
  Database['lunchboxd']['Views'][V]['Row'];

/**
 * A view row with the columns this client relies on narrowed to non-null.
 *
 * Postgres cannot promise a view's columns are non-null, so the generator
 * types every one of them nullable and the client used to answer with a
 * hand-written transcription of the same columns, asserted over the generated
 * row — which meant a renamed column still compiled, defeating the whole point
 * of generating the types (#96).
 *
 * Deriving instead leaves exactly one claim per query, and it is a real claim
 * about the view rather than a second copy of its shape: `category_stats` is
 * built from `categories`, whose id and name are `not null`, so those columns
 * cannot arrive null however the generator has to type them.
 */
type Guaranteed<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };

/**
 * A category and its numbers. `created_by` stays nullable: it is null once the
 * account that invented it is deleted, and nobody inherits it.
 */
export type CategoryStat = Guaranteed<
  ViewRow<'category_stats'>,
  'id' | 'name' | 'ranking_count' | 'ranker_count'
>;

export type ProfileMeta = {
  username: string;
  is_admin?: boolean;
  is_supporter?: boolean;
  tags?: string[];
};

export type Ranking = {
  id: string;
  food: string;
  score: number;
  created_at: string;
  user_id: string;
  profiles: ProfileMeta | null;
  hearted: boolean;
  review: string | null;
  /** 1–4 when this ranking sits in its author's top four, null otherwise. */
  top_rank: number | null;
  /**
   * How many other people liked this, as PostgREST returns an embedded
   * aggregate: a one-element array, or an empty one where nobody has. Read it
   * through {@link likeCount} rather than indexing it at a call site.
   */
  likes: { count: number }[];
};

/** The likes on a ranking, flattened out of PostgREST's aggregate shape. */
export function likeCount(ranking: { likes?: { count: number }[] | null }): number {
  return ranking.likes?.[0]?.count ?? 0;
}

/**
 * The columns every ranking list reads. One string so no list drifts from the
 * rest — `likes(count)` is an embedded aggregate, so the count arrives with the
 * row instead of costing a query per surface.
 */
const RANKING_FIELDS =
  'id, food, score, created_at, user_id, hearted, review, top_rank, likes(count), profiles(username, is_admin, is_supporter, tags)';

export type Activity = Ranking & { categories: { name: string } | null };

export type ProfileInfo = {
  id: string;
  username: string;
  created_at: string;
  is_admin: boolean;
  is_supporter: boolean;
  banned_at: string | null;
  tags: string[];
  /** The three chosen card stats. Null slots mean "never opened the studio". */
  card_slot_1: string | null;
  card_slot_2: string | null;
  card_slot_3: string | null;
  card_accent: string | null;
};

export type ProfileRanking = Activity & { category_id: string };

/**
 * A person's totals, computed server-side. The ranking list below them is
 * capped, and deriving these from that array made a heavy eater's "lifetime
 * average" silently the average of their most recent page.
 */
export type ProfileStats = Guaranteed<
  ViewRow<'profile_stats'>,
  'ranking_count' | 'category_count' | 'hearted_count'
>;

/**
 * What the UI shows when a query fails.
 *
 * Every fetch used to destructure `data` and drop `error`, so a Supabase
 * outage, an expired PostgREST schema cache, or a dead connection all rendered
 * as "no categories yet" — the site reporting emptiness as fact. These strings
 * are deliberately vague about the cause (nobody can act on PGRST106) and
 * specific about what failed.
 */
const FETCH_FAILED = "Couldn't reach the kitchen";

function fail(where: string, error: { message: string } | null): string | null {
  if (!error) return null;
  console.error(`lunchboxd: ${where} failed —`, error.message);
  return FETCH_FAILED;
}

/**
 * One person's public page: their profile row, their totals, their top four and
 * their ranking history. `profile` is undefined while loading, null when no
 * such handle exists. `error` is set when the lookup itself failed, which is a
 * different thing from the handle not existing.
 */
export function useProfile(username: string, version: number) {
  const [profile, setProfile] = useState<ProfileInfo | null | undefined>(undefined);
  const [rankings, setRankings] = useState<ProfileRanking[] | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [top, setTop] = useState<ProfileRanking[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset to loading only on a handle change; version bumps (realtime, tab
  // focus) refetch in place so the page never flashes.
  useEffect(() => {
    setProfile(undefined);
    setRankings(null);
    setStats(null);
    setTop([]);
    setError(null);
  }, [username]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      // `username` is citext, so this matches regardless of case — #/u/Jack
      // finds `jack`.
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select(
          'id, username, created_at, is_admin, is_supporter, banned_at, tags, card_slot_1, card_slot_2, card_slot_3, card_accent',
        )
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

      const [listRes, statRes, topRes] = await Promise.all([
        supabase
          .from('rankings')
          .select(`${RANKING_FIELDS}, category_id, categories(name)`)
          .eq('user_id', prof.id)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('profile_stats')
          .select('ranking_count, category_count, hearted_count, avg_score')
          .eq('user_id', prof.id)
          .maybeSingle(),
        // Its own query rather than a filter over the list above: the list is
        // capped at 500 and ordered by recency, so a top four picked from a
        // heavy eater's older rankings would simply not be in it.
        supabase
          .from('rankings')
          .select(`${RANKING_FIELDS}, category_id, categories(name)`)
          .eq('user_id', prof.id)
          .not('top_rank', 'is', null)
          .order('top_rank'),
      ]);
      if (!alive) return;
      const err = fail('profile rankings', listRes.error ?? statRes.error ?? topRes.error);
      if (err) {
        setError(err);
        return;
      }
      setRankings(listRes.data ?? []);
      setStats(statRes.data as ProfileStats | null);
      setTop(topRes.data ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [username, version]);

  return { profile, rankings, stats, top, error };
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

  /**
   * Bump the counter, at most once per burst.
   *
   * A successful write bumps this directly *and* comes back through the
   * realtime subscription a moment later, so the tab that made the change used
   * to refetch the board, the activity feed, the like set and the unread count
   * twice — and `category_stats` aggregates every ranking in the table on each
   * pass. The window coalesces the write and its own echo into one refetch,
   * the way the focus/visibility pair below was already debounced (#109).
   *
   * 250ms rather than something tighter: the echo arrives over a websocket
   * after a Postgres commit, which is comfortably longer than a frame and
   * still far below what reads as lag on a list that just changed.
   */
  const pending = useRef(0);
  const refresh = useCallback(() => {
    clearTimeout(pending.current);
    pending.current = setTimeout(() => setVersion((v) => v + 1), 250);
  }, []);
  useEffect(() => () => clearTimeout(pending.current), []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    Promise.all([
      supabase.from('category_stats').select('*'),
      supabase
        .from('rankings')
        .select(`${RANKING_FIELDS}, categories(name)`)
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
    // The one place the local alias earns its keep: the cleanup below runs
    // after the effect returns, and the null check doesn't reach into it.
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
    // Focus and visibilitychange both fire on the same tab switch; `refresh`
    // coalesces the pair into one refetch on its own.
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      refresh();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      client.removeChannel(channel);
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
    let alive = true;
    (async () => {
      const { data: cat, error: catErr } = await supabase
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
      const { data, error: statErr } = await supabase
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
 * index); the supabase then refines with a word-boundary regex so "#tag" doesn't
 * match "#tagged". That boundary rule must stay in step with HASHTAG_RE in
 * `src/text.ts` — both are covered by `src/text.test.ts`.
 */
export function useHashtagReviews(hashtag: string, version: number) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanHashtag(hashtag);

  useEffect(() => {
    setRows(null);
    setError(null);
  }, [hashtag]);

  useEffect(() => {
    if (!supabase) return;
    if (!clean) {
      setRows([]);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('rankings')
        .select(`${RANKING_FIELDS}, categories(name)`)
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
    // Clears the error as well as the rows: a failure against the previous
    // category would otherwise survive into this one and render LoadError over
    // a category that loaded fine.
    setError(null);
    if (!supabase || !categoryId) {
      setRankings(null);
      return;
    }
    let alive = true;
    supabase
      .from('rankings')
      .select(RANKING_FIELDS)
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
 * The numbers behind every stat a calling card could show, for one person.
 *
 * Its own query rather than more columns on `useProfile`: the card is the only
 * thing that needs these, they cost a pile of per-person aggregates, and the
 * Eaters tab will later want the same view for many profiles at once.
 *
 * The scores arrive as JSON numbers; `cardStatsFrom` is still the one place
 * a row becomes a `CardStats`, so a card says the same thing whichever page
 * drew it.
 */
export function useCardStats(userId: string | null, version: number) {
  const [stats, setStats] = useState<CardStats | null>(null);

  useEffect(() => {
    // Cleared on a person change, not only when the id goes null: walking from
    // one profile to the next otherwise left the card showing the numbers of
    // the person you just left, attributed by name to the one you opened.
    setStats(null);
    if (!supabase || !userId) return;
    let alive = true;
    supabase
      .from('profile_card_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          if (error) console.error('lunchboxd: card stats failed —', error.message);
          return;
        }
        setStats(cardStatsFrom(data));
      });
    return () => {
      alive = false;
    };
  }, [userId, version]);

  return stats;
}

/**
 * Store your own three slots and accent.
 *
 * The column grant covers exactly these four alongside `username` and `tags`,
 * so this cannot reach `is_admin` or `is_supporter` — and the accent is gated
 * on read (`resolveAccent`) rather than here, so a supporter who lapses and
 * returns gets their colour back without ever rewriting the row.
 */
export async function saveCard(
  userId: string,
  slots: readonly (string | null)[],
  accent: string | null,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase
    .from('profiles')
    .update({
      card_slot_1: slots[0] ?? null,
      card_slot_2: slots[1] ?? null,
      card_slot_3: slots[2] ?? null,
      card_accent: accent,
    })
    .eq('id', userId);
  return error
    ? {
        error: refused('saving a calling card', error, {
          [PG.checkViolation]: "That isn't one of the stats a card can show.",
        }),
      }
    : {};
}

/**
 * Which rankings the viewer has liked, as a set of ranking ids.
 *
 * One query for the whole view rather than a per-row "did I like this": a
 * person's own likes are few, and the set is what every row needs to know.
 * Empty for signed-out viewers and for guests, who can't like at all (#42) —
 * their control still renders, as the site's "Keep account" prompt.
 */
export function useMyLikes(userId: string | null, version: number) {
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase || !userId) {
      setLiked(new Set());
      return;
    }
    let alive = true;
    supabase
      .from('likes')
      .select('ranking_id')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          // Not page-breaking: the counts still render, the viewer's own marks
          // just sit unlit until the next refresh.
          console.error('lunchboxd: own likes failed —', error.message);
          return;
        }
        setLiked(new Set((data ?? []).map((l) => l.ranking_id)));
      });
    return () => {
      alive = false;
    };
  }, [userId, version]);

  return liked;
}

export { cardStatsFrom };

export type Eater = Guaranteed<
  ViewRow<'eaters'>,
  'user_id' | 'username' | 'is_admin' | 'is_supporter'
>;

export type EaterSort = 'recent' | 'rankings' | 'likes' | 'az';

/**
 * A column of the `eaters` view, taken from the generated types so a typo is a
 * compile error rather than a PostgREST 400 the tab renders as a failure (#98).
 */
type EaterColumn = keyof Database['lunchboxd']['Views']['eaters']['Row'];

const EATER_ORDER: Record<EaterSort, { column: EaterColumn; ascending: boolean }> = {
  recent: { column: 'last_ranked_at', ascending: false },
  rankings: { column: 'ranking_count', ascending: false },
  likes: { column: 'likes_received', ascending: false },
  az: { column: 'username', ascending: true },
};

/** How many eaters the tab draws before the "Show more" button. */
export const EATERS_PAGE = 24;

/**
 * The Eaters tab: everyone who has ever ranked, with what their card needs.
 *
 * Sorted and paged in the database rather than in the supabase. The tab shows 24
 * of seventy-odd and offers four orderings; sorting here would mean fetching
 * every eater and their whole card to draw a third of them, and the cap would
 * be a slice rather than a limit. `count: 'exact'` rides along so the button
 * can say how many are left rather than guessing whether any are.
 *
 * `shown` grows by a page at a time and resets whenever the sort changes — a
 * new ordering is a new list, and keeping the old depth would silently show
 * three pages of it.
 */
export function useEaters(sort: EaterSort, shown: number, version: number) {
  const [items, setItems] = useState<Eater[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const { column, ascending } = EATER_ORDER[sort];
    supabase
      .from('eaters')
      .select('*', { count: 'exact' })
      // Nulls last matters for `recent` only in theory — the view is filtered
      // to people with a ranking, so last_ranked_at is never null — but the
      // filter and the order are in different places and only one of them is
      // obvious from here.
      .order(column, { ascending, nullsFirst: false })
      // A stable tiebreak, or two people with the same count swap places
      // between pages and one of them is fetched twice while the other is
      // never fetched at all.
      .order('user_id', { ascending: true })
      .range(0, shown - 1)
      .then(({ data, count, error }) => {
        if (!alive) return;
        setLoaded(true);
        if (error) {
          console.error('lunchboxd: eaters failed —', error.message);
          setError(true);
          return;
        }
        setError(false);
        setItems((data ?? []) as Eater[]);
        setTotal(count ?? 0);
      });
    return () => {
      alive = false;
    };
  }, [sort, shown, version]);

  return { items, total, loaded, error };
}

export type Notification = {
  id: string;
  created_at: string;
  read_at: string | null;
  kind: string;
  actor: ProfileMeta | null;
  rankings: { food: string; categories: { name: string } | null } | null;
};

/**
 * Your notifications, newest first — the only private read on the site.
 *
 * Both foreign keys point at `profiles`, so the actor embed has to name the
 * constraint (`profiles!notifications_actor_id_fkey`) or PostgREST can't tell
 * which side is wanted and refuses the whole query.
 *
 * The row can outlive what it describes only in one direction: a ranking is
 * deleted and the cascade takes the notification with it. `rankings` is
 * nonetheless read as nullable — a null there means a race with a delete, and
 * the row renders as its plain sentence rather than crashing the page.
 */
export function useNotifications(userId: string | null, version: number) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) {
      setItems([]);
      setLoaded(true);
      return;
    }
    let alive = true;
    setLoaded(false);
    supabase
      .from('notifications')
      .select(
        'id, created_at, read_at, kind, actor:profiles!notifications_actor_id_fkey(username, is_admin, is_supporter, tags), rankings(food, categories(name))',
      )
      // RLS is what actually scopes these rows, and it is not going anywhere.
      // The filter is the second line: without it the query claims to be about
      // one person and isn't, and the day that policy is widened for a new
      // `kind`, the supabase would quietly start reading other people's news.
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        setLoaded(true);
        if (error) {
          console.error('lunchboxd: notifications failed —', error.message);
          setError(true);
          return;
        }
        setError(false);
        setItems((data ?? []) as unknown as Notification[]);
      });
    return () => {
      alive = false;
    };
  }, [userId, version]);

  return { items, loaded, error };
}

/**
 * How many are unread, for the bell. A `head` count rather than the list: the
 * header asks on every page, and the answer is one number.
 */
export function useUnreadCount(userId: string | null, version: number) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!supabase || !userId) {
      setCount(0);
      return;
    }
    let alive = true;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .then(({ count, error }) => {
        if (!alive) return;
        if (error) {
          // The bell just doesn't light up. Not worth a visible failure.
          console.error('lunchboxd: unread count failed —', error.message);
          return;
        }
        setCount(count ?? 0);
      });
    return () => {
      alive = false;
    };
  }, [userId, version]);

  return count;
}

/**
 * Mark everything read. Called when the page is opened, not per row: the page
 * IS the reading of them, and a per-row "mark read" control on a list you are
 * looking at is a control that does nothing you didn't just do.
 *
 * The unread marks stay on screen for the visit that cleared them — you get to
 * see what was new. RLS scopes the update to your own rows and the grant is
 * column-scoped to `read_at`, so this can't touch anything else.
 */
export async function markNotificationsRead(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) console.error('lunchboxd: marking notifications read failed —', error.message);
}

/**
 * A rejected write, said out loud.
 *
 * Logs the raw Postgres text (the useful thing when debugging) and returns the
 * sentence a person sees (never that text — see `writeError`). Every write in
 * this file ends here; none of them return `error.message` any more.
 */
function refused(where: string, error: WriteError, known: Record<string, string> = {}): string {
  console.error(`lunchboxd: ${where} refused —`, error.code ?? '?', error.message);
  return writeError(error, known);
}

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
        if (!raced) return { error: refused('inventing a category', error) };
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
  // Logging the same food twice is allowed (20260725013000). What's left is the
  // stutter guard and the ten-a-day cap, and both are raised by the trigger as
  // sentences, so they pass straight through `refused` to the rank form.
  return { error: refused('logging a ranking', error) };
}

/**
 * Edit one of your own rankings in place. The column grant covers exactly these
 * four fields, so a ranking can't be moved between people or categories from
 * the supabase. Edits are silent by design — no marker, and `created_at` doesn't
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
  // No duplicate case to name any more: editing a food into one you've already
  // ranked is allowed, same as logging it twice.
  return error ? { error: refused('editing a ranking', error) } : {};
}

/** Admin-only (enforced server-side): rename a category in place. */
export async function renameCategory(id: string, name: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const next = name.trim();
  const { error } = await supabase.rpc('rename_category', { cat: id, new_name: next });
  if (!error) return {};
  return {
    error: refused('renaming a category', error, {
      [PG.duplicate]: `"${next}" already exists — merge into it instead.`,
    }),
  };
}

/**
 * Pin one of your own rankings to your top four, or unpin it.
 *
 * The free slot is worked out here rather than passed in: every surface that
 * offers the pin knows about one ranking, not about the other three, so the
 * current set is read first. The partial unique index is what actually holds
 * the rule — two tabs pinning at the same moment race, and the loser gets the
 * duplicate below rather than a second ranking in slot 2.
 */
export async function setTopPick(
  ranking: { id: string; user_id: string },
  pinned: boolean,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  if (!pinned) {
    const { error } = await supabase
      .from('rankings')
      .update({ top_rank: null })
      .eq('id', ranking.id);
    return error ? { error: refused('unpinning a ranking', error) } : {};
  }

  const { data, error: readErr } = await supabase
    .from('rankings')
    .select('top_rank')
    .eq('user_id', ranking.user_id)
    .not('top_rank', 'is', null);
  if (readErr) return { error: FETCH_FAILED };

  const slot = nextTopSlot((data ?? []).map((r) => r.top_rank));
  if (slot === null) {
    return { error: 'Your top four is full — unpin one of them first.' };
  }

  const { error } = await supabase.from('rankings').update({ top_rank: slot }).eq('id', ranking.id);
  if (!error) return {};
  return {
    error: refused('pinning a ranking', error, {
      [PG.duplicate]: 'Something else took that spot a moment ago. Try again.',
    }),
  };
}

/**
 * Delete a category and, by cascade, every ranking in it. Permission is decided
 * server-side: admins always, the person who invented it only while nobody else
 * has ranked there. There is no undo.
 */
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.rpc('delete_category', { cat: id });
  // Its refusals are raised as P0001 with sentences already written for people,
  // so they pass through writeError untouched.
  return error ? { error: refused('deleting a category', error) } : {};
}

/**
 * Admin-only (enforced server-side): move every ranking from `source` into
 * `target` and delete `source`. The averages recompute; there is no undo.
 */
export async function mergeCategories(source: string, target: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.rpc('merge_categories', { source, target });
  // This used to be able to collide with the one-per-food index when somebody
  // had ranked the same food in both categories. With that index gone the
  // rankings simply move.
  return error ? { error: refused('merging categories', error) } : {};
}

/**
 * Flip the heart on one of your own rankings. Returns the error rather than
 * swallowing it: the caller flips optimistically, so a rejected write (banned
 * account, expired session) has to be able to put the glyph back.
 */
export async function setHearted(rankingId: string, hearted: boolean): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('rankings').update({ hearted }).eq('id', rankingId);
  return error ? { error: refused('hearting a ranking', error) } : {};
}

/**
 * Like somebody else's ranking, or take the like back.
 *
 * The refusals worth naming are all one SQLSTATE: the insert policy turns away
 * guests, banned accounts and self-likes alike with a 42501, and the guest is
 * far and away the likeliest of the three — so that is the sentence, and it
 * invites rather than scolds. A duplicate is reported as success: the caller
 * asked for "liked" and liked is what it already is.
 */
export async function setLike(
  rankingId: string,
  userId: string,
  liked: boolean,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  if (!liked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('ranking_id', rankingId)
      .eq('user_id', userId);
    return error ? { error: refused('unliking', error) } : {};
  }
  const { error } = await supabase.from('likes').insert({ ranking_id: rankingId, user_id: userId });
  if (!error || error.code === PG.duplicate) return {};
  return {
    error: refused('liking', error, {
      [PG.rlsDenied]:
        'Likes need an email on your account. Use “Keep account” and this one is yours for good.',
    }),
  };
}

export async function deleteRanking(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('rankings').delete().eq('id', id);
  return error ? { error: refused('deleting a ranking', error) } : {};
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
  // The charset and reserved-name rules are both check constraints, so they
  // arrive as one undifferentiated 23514 and the message has to cover both.
  return {
    error: refused('renaming a handle', error, {
      [PG.duplicate]: `"${name}" is already claimed. A handle stays with the account that took it.`,
      [PG.checkViolation]:
        'Handles run 2 to 24 characters, using letters, numbers, hyphens and underscores. A few names are reserved.',
    }),
  };
}

/** Replace your own flair tags (server enforces the allowed roster). */
export async function setProfileTags(userId: string, tags: string[]): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.from('profiles').update({ tags }).eq('id', userId);
  return error ? { error: refused('setting flair tags', error) } : {};
}

/**
 * Admin-only (enforced server-side): bans the profile, deleting their rankings
 * and every category they invented (with everyone's rankings in those
 * categories).
 */
export async function banProfile(targetId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not connected' };
  const { error } = await supabase.rpc('ban_profile', { target: targetId });
  return error ? { error: refused('banning a profile', error) } : {};
}
