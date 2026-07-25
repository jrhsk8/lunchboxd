import { useState } from 'react';

import {
  accentToken,
  CARD_ACCENT_KEYS,
  CARD_STAT_GROUPS,
  CARD_STAT_LABELS,
  cardTrio,
  isCardStatKey,
  resolveAccent,
  resolveSlot,
  type CardStatKey,
  type CardStats,
} from './calling-card';
import { saveCard } from './data';
import { panel, Tag, type TagKind } from './ui';

/**
 * The calling card: three chosen stats under a handle, identical wherever it
 * renders — the profile header today, the Eaters tab next.
 *
 * All the rules (which three stats, how each renders, whether the accent
 * applies) live in the pure `calling-card.ts` core, so this file is markup and
 * nothing else. Long values clamp to two lines rather than ellipsising on one:
 * half this vocabulary resolves to a category or food name, and the house rule
 * is that text wraps rather than getting cut (app-shell.md § Mobile) — the
 * clamp is the guard rail for a 120-character food, not the routine case.
 */
export function CallingCard({
  handle,
  href,
  tags = [],
  stats,
  slots,
  accent,
  isSupporter,
  onEdit,
  className = '',
}: {
  handle: string;
  /**
   * Where the handle points. Omitted on the profile header — that card is
   * already on the page it would link to.
   */
  href?: string;
  tags?: TagKind[];
  stats: CardStats;
  slots: readonly (string | null)[] | null;
  accent: string | null;
  isSupporter: boolean;
  /** Present only on your own card: opens the studio. */
  onEdit?: () => void;
  className?: string;
}) {
  const [hero, second, third] = cardTrio(slots).map((key) => resolveSlot(key, stats));
  const applied = resolveAccent(accent, isSupporter);

  return (
    <article
      className={`${panel} ${applied ? 'card-accent' : ''} flex flex-col gap-2.5 px-4 py-3 ${className}`}
      style={
        applied ? ({ '--card-accent': accentToken(applied) } as React.CSSProperties) : undefined
      }
      aria-label={`${handle}'s calling card`}
    >
      <div className="flex items-center gap-2">
        {href ? (
          <a
            href={href}
            title={`${handle}'s profile`}
            className="min-w-0 flex-1 truncate text-[13px] font-bold hover:text-clay hover:underline"
          >
            {handle}
          </a>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{handle}</span>
        )}
        {tags.map((t) => (
          <Tag key={t} kind={t} size={9} />
        ))}
        {onEdit && (
          <button
            type="button"
            aria-label="choose your card stats"
            title="Choose your card stats"
            className="shrink-0 cursor-pointer rounded border-0 bg-transparent px-1 text-sm text-faint transition-colors hover:text-clay"
            onClick={onEdit}
          >
            ✎
          </button>
        )}
      </div>

      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 text-2xl leading-tight font-bold break-words tabular-nums">
            {hero.value}
          </p>
          <p className="m-0 mt-0.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
            {hero.label}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 border-l border-edge pl-3">
          {[second, third].map((slot, i) => (
            <div key={i} className="min-w-0">
              <p className="m-0 line-clamp-2 text-sm leading-tight font-semibold break-words tabular-nums">
                {slot.value}
              </p>
              <p className="m-0 text-[10px] tracking-wide text-faint">{slot.label}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

const selectClass =
  'w-full rounded-lg border border-edge bg-field px-2 py-1.5 text-xs text-ink focus:border-clay focus:outline-none';

/**
 * The studio: picks the three stats, and the accent for supporters.
 *
 * Inline under the card rather than a dialog — the site retired its one modal
 * for a route and its other for nothing, and this is a three-field form that
 * wants the card visible above it while you choose.
 */
export function CardStudio({
  userId,
  slots,
  accent,
  isSupporter,
  onSaved,
  onClose,
}: {
  userId: string;
  slots: readonly (string | null)[] | null;
  accent: string | null;
  isSupporter: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [picks, setPicks] = useState<CardStatKey[]>(() => [...cardTrio(slots)]);
  const [tint, setTint] = useState<string | null>(accent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await saveCard(userId, picks, isSupporter ? tint : null);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <section className={`${panel} flex flex-col gap-3 p-4`} aria-label="choose your card stats">
      <p className="m-0 text-[11px] font-semibold tracking-wider text-dim uppercase">
        Your card shows
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {picks.map((pick, slot) => (
          <label key={slot} className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-faint">
              {slot === 0 ? 'Headline' : `Slot ${slot + 1}`}
            </span>
            <select
              className={selectClass}
              value={pick}
              // Narrowed here rather than held as a string: the fourteen keys
              // are pinned by a CHECK constraint in
              // `20260725022000_calling_card.sql`, and the studio is the one
              // component whose whole job is choosing from them (#99). Every
              // option below comes from CARD_STAT_GROUPS, so the guard only
              // fires if the picker and the vocabulary disagree.
              onChange={(e) => {
                const key = e.target.value;
                if (!isCardStatKey(key)) return;
                setPicks(picks.map((p, i) => (i === slot ? key : p)));
              }}
            >
              {CARD_STAT_GROUPS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {CARD_STAT_LABELS[key]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* No picker at all for a non-supporter, rather than a disabled one: a
          control you can see and can't use reads as a fault, and this is a
          thank-you rather than an upsell. */}
      {isSupporter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-wide text-faint">Card colour</span>
          <button
            type="button"
            aria-pressed={tint === null}
            title="No tint"
            className={`h-5 w-5 cursor-pointer rounded-full border bg-panel ${
              tint === null ? 'border-ink' : 'border-edge'
            }`}
            onClick={() => setTint(null)}
          />
          {CARD_ACCENT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tint === key}
              aria-label={key}
              title={key}
              className={`h-5 w-5 cursor-pointer rounded-full border ${
                tint === key ? 'border-ink' : 'border-edge'
              }`}
              style={{ background: accentToken(key) }}
              onClick={() => setTint(key)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-transparent bg-clay px-3 py-1.5 text-xs font-bold text-field transition-colors hover:bg-clay-hover disabled:opacity-40"
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save card'}
        </button>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-faint hover:text-ink"
          onClick={onClose}
        >
          Cancel
        </button>
        {error && <span className="text-xs text-bad">{error}</span>}
      </div>
    </section>
  );
}
