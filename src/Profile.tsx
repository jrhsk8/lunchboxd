import { useState } from 'react';

import { banProfile, deleteRanking, renameProfile, setProfileTags, useProfile } from './data';
import { Stars } from './Stars';
import {
  Heart,
  kicker,
  panel,
  profileHref,
  profileTags,
  scoreTone,
  SELF_TAGS,
  Tag,
  timeAgo,
} from './ui';

function Stat({
  label,
  value,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <p className={`m-0 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="m-0 mt-0.5 text-[11px] font-semibold tracking-wider text-dim uppercase">
        {label}
      </p>
    </div>
  );
}

/** Flair picker on your own profile: toggle any of the fixed self-tags. */
function TagPicker({
  userId,
  current,
  onChanged,
}: {
  userId: string;
  current: string[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle(tag: string) {
    if (busy) return;
    setBusy(true);
    // Flair is either/or (DB-enforced): picking one replaces the other.
    const next = current.includes(tag) ? [] : [tag];
    await setProfileTags(userId, next);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-wider text-dim uppercase">Your tags</span>
      {SELF_TAGS.map((t) => {
        const on = current.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            disabled={busy}
            title={on ? 'Click to remove' : 'Click to wear it'}
            className={`cursor-pointer rounded-lg border-0 bg-transparent p-0 transition-opacity ${
              on ? '' : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
            }`}
            onClick={() => toggle(t)}
          >
            <Tag kind={t} size={11} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline rename on your own profile — the escape hatch for anyone stuck with
 * a generated eater-* handle. On success the page routes to the new handle
 * and `onRenamed` refreshes the cached header name.
 */
function RenameControl({
  userId,
  current,
  onRenamed,
}: {
  userId: string;
  current: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = name.trim();
    if (busy || next.length < 2) return;
    if (next === current) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await renameProfile(userId, next);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onRenamed();
    window.location.hash = profileHref(next).slice(1);
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Pick a new handle (the old one is released for anyone to claim)"
        aria-label="change handle"
        className="cursor-pointer rounded-lg border-0 bg-transparent p-1 text-sm text-faint transition-colors hover:text-clay"
        onClick={() => {
          setName(current);
          setError(null);
          setEditing(true);
        }}
      >
        ✎
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        className="rounded-lg border border-edge bg-field px-2 py-1 text-sm font-normal text-ink placeholder:text-faint focus:border-clay focus:outline-none"
        placeholder="hotdog_hank"
        maxLength={24}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button
        type="button"
        className="cursor-pointer rounded-lg border border-edge bg-raised px-2.5 py-1 text-xs font-semibold text-ink hover:bg-raised-hover disabled:opacity-40"
        disabled={busy || name.trim().length < 2}
        onClick={save}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint hover:text-ink"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
      {error && <span className="max-w-64 text-xs font-normal text-bad">{error}</span>}
    </span>
  );
}

/** The admin ban hammer: destructive and loud about it. */
function BanButton({
  targetId,
  username,
  onChanged,
}: {
  targetId: string;
  username: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="cursor-pointer rounded-lg border border-bad/50 bg-bad/10 px-3 py-1.5 text-xs font-bold text-bad transition-colors hover:bg-bad/20 disabled:opacity-40"
        onClick={async () => {
          if (
            !window.confirm(
              `Ban "${username}"? This permanently deletes their rankings AND every category they invented (including everyone else's rankings in those categories), and blocks the account from posting. There is no unban button.`,
            )
          ) {
            return;
          }
          setBusy(true);
          const result = await banProfile(targetId);
          setBusy(false);
          if (result.error) setError(result.error);
          onChanged();
        }}
      >
        {busy ? 'Banning…' : 'Ban profile'}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

/** One eater's public record: who they are, their numbers, everything they've ranked. */
export function ProfilePage({
  username,
  version,
  userId,
  viewerIsAdmin,
  onChanged,
  onRenamed,
}: {
  username: string;
  version: number;
  userId: string | null;
  viewerIsAdmin: boolean;
  onChanged: () => void;
  onRenamed: () => void;
}) {
  const { profile, rankings } = useProfile(username, version);

  if (profile === undefined)
    return <p className="m-0 py-16 text-center text-sm text-faint">Loading…</p>;

  if (profile === null) {
    return (
      <div className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}>
        <p className="m-0 text-[15px] font-semibold">No one by that handle</p>
        <p className="mt-2 mb-4 text-sm text-dim">"{username}" hasn't pulled up a chair here.</p>
        <a href="#/" className="text-sm font-semibold text-clay hover:text-clay-hover">
          ← Back to the board
        </a>
      </div>
    );
  }

  const list = rankings ?? [];
  const own = userId === profile.id;
  const banned = profile.banned_at !== null;
  const avg = list.length ? list.reduce((s, r) => s + Number(r.score), 0) / list.length : null;
  const categoryCount = new Set(list.map((r) => r.category_id)).size;
  const lovedCount = list.filter((r) => r.hearted).length;
  const since = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="#/" className="text-xs font-semibold text-faint hover:text-clay">
            ← Back to the board
          </a>
          <p className={`${kicker} mt-4 mb-1.5`}>{own ? 'Your profile' : 'Profile'}</p>
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[28px] font-bold">
            {profile.username}
            {banned && (
              <span className="inline-flex items-center rounded-md border border-bad/40 bg-bad/10 px-2 py-0.5 align-middle text-[11px] font-bold tracking-wider text-bad uppercase">
                Banned
              </span>
            )}
            {!banned && profileTags(profile).map((t) => <Tag key={t} kind={t} size={12} />)}
            {own && !banned && (
              <RenameControl userId={profile.id} current={profile.username} onRenamed={onRenamed} />
            )}
          </h1>
          <p className="mt-1 mb-0 text-sm text-dim">Eating since {since}</p>
        </div>
        {viewerIsAdmin && !own && !banned && !profile.is_admin && (
          <BanButton targetId={profile.id} username={profile.username} onChanged={onChanged} />
        )}
      </div>

      {own && !banned && (
        <TagPicker userId={profile.id} current={profile.tags} onChanged={onChanged} />
      )}

      {banned ? (
        <div className={`${panel} px-6 py-12 text-center`}>
          <p className="m-0 text-[15px] font-semibold">This account is banned</p>
          <p className="mt-2 mb-0 text-sm text-dim">
            Their rankings and invented categories were removed on{' '}
            {new Date(profile.banned_at!).toLocaleDateString()}.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={list.length === 1 ? 'Ranking' : 'Rankings'} value={String(list.length)} />
            <Stat
              label={categoryCount === 1 ? 'Category' : 'Categories'}
              value={String(categoryCount)}
            />
            <Stat
              label="Average"
              value={avg === null ? '—' : avg.toFixed(2)}
              tone={avg === null ? 'text-faint' : scoreTone(avg)}
            />
            <Stat label="Loved" value={lovedCount ? `♥ ${lovedCount}` : '—'} tone="text-gold" />
          </div>

          {rankings === null ? (
            <p className="m-0 py-8 text-center text-sm text-faint">Loading…</p>
          ) : list.length === 0 ? (
            <div className={`${panel} px-6 py-12 text-center`}>
              <p className="m-0 text-[15px] font-semibold">Nothing ranked yet</p>
              <p className="mt-2 mb-0 text-sm text-dim">
                {own ? 'Your first bite is waiting.' : 'A clean plate so far.'}
              </p>
            </div>
          ) : (
            <div className={`${panel} px-5 py-3`}>
              <ul className="m-0 flex list-none flex-col p-0">
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="group flex items-center gap-3 border-b border-edge py-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {r.food} <span className="text-dim">in</span>{' '}
                      <span className="font-semibold text-clay">{r.categories?.name ?? '?'}</span>
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-faint tabular-nums">
                      {timeAgo(r.created_at)}
                    </span>
                    <Stars value={Number(r.score)} size={13} />
                    <span className="w-8 text-right text-sm font-bold tabular-nums">
                      {Number(r.score).toFixed(1)}
                    </span>
                    <Heart ranking={r} userId={userId} onChanged={onChanged} />
                    {own ? (
                      <button
                        type="button"
                        className="w-[22px] shrink-0 cursor-pointer rounded border-0 bg-transparent px-0 text-center text-sm text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
                        aria-label={`delete ${r.food}`}
                        onClick={async () => {
                          await deleteRanking(r.id);
                          onChanged();
                        }}
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="w-[22px] shrink-0" aria-hidden />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
