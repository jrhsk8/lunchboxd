import { useRef, useState } from 'react';

const STAR = '★';

/**
 * Five stars with fractional gold fill — read-only display.
 *
 * `role="img"` is load-bearing: `aria-label` on a bare span is only valid on an
 * element whose role supports naming, so without it a screen reader may drop
 * the label and read the raw ★★★★★★★★★★ of the two stacked glyph runs instead.
 * Every score on the site renders through here.
 */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className="relative inline-block leading-none tracking-[2px] select-none"
      style={{ fontSize: size }}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      <span className="text-edge" aria-hidden>
        {STAR.repeat(5)}
      </span>
      <span
        className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-gold"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        {STAR.repeat(5)}
      </span>
    </span>
  );
}

const STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

/**
 * Star input in half-star steps: ten invisible half-width hit zones over one
 * fractional-fill display, Letterboxd-style.
 *
 * Two things the invisible-overlay trick costs, both fixed here:
 *
 * - The zones are `opacity-0`, which hides the focus outline along with
 *   everything else, so a sighted keyboard user landed on a control with no
 *   indication it had focus. The ring goes on the wrapper via `:has()`, and the
 *   fill previews the focused step.
 * - It's a radiogroup, so it takes a roving tabindex and arrow keys: one tab
 *   stop, Left/Right by a half star, Home/End for the ends. Ten tab stops to
 *   reach 4.5 was the alternative.
 *
 * Below `sm` the stars scale up. Five 30px stars is a ~160px row, which makes
 * each half-star zone about 16px — well under the ~44px touch guideline, on the
 * primary action of the entire site. 44px stars give ~24px zones; the rank
 * panel has the width.
 */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const shown = hover ?? value;
  // The roving tab stop: the chosen step, or the first when nothing is chosen.
  const focusStep = value > 0 ? value : 0.5;

  const move = (to: number) => {
    const next = Math.min(5, Math.max(0.5, to));
    onChange(next);
    setHover(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-step="${next}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key;
    if (key === 'ArrowLeft' || key === 'ArrowDown') move((value || 0.5) - 0.5);
    else if (key === 'ArrowRight' || key === 'ArrowUp') move((value || 0) + 0.5);
    else if (key === 'Home') move(0.5);
    else if (key === 'End') move(5);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex items-center gap-3" onMouseLeave={() => setHover(null)}>
      <div className="relative inline-block rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-clay">
        <span className="sm:hidden">
          <Stars value={shown} size={44} />
        </span>
        <span className="hidden sm:inline">
          <Stars value={shown} size={30} />
        </span>
        <div
          ref={group}
          className="absolute inset-0 flex"
          role="radiogroup"
          aria-label="score"
          onKeyDown={onKeyDown}
        >
          {STEPS.map((step) => (
            <button
              key={step}
              type="button"
              role="radio"
              data-step={step}
              tabIndex={step === focusStep ? 0 : -1}
              aria-checked={value === step}
              aria-label={`${step} stars`}
              className="flex-1 cursor-pointer opacity-0 focus:outline-none"
              onMouseEnter={() => setHover(step)}
              onFocus={() => setHover(step)}
              onBlur={() => setHover(null)}
              onClick={() => onChange(step)}
            />
          ))}
        </div>
      </div>
      <span className="w-8 text-sm font-bold text-dim tabular-nums">
        {shown > 0 ? shown.toFixed(1) : '—'}
      </span>
    </div>
  );
}
