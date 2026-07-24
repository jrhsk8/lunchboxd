import { useState } from 'react';

const STAR = '★';

/** Five stars with fractional gold fill — read-only display. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className="relative inline-block leading-none tracking-[2px] select-none"
      style={{ fontSize: size }}
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      <span className="text-edge">{STAR.repeat(5)}</span>
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

/**
 * Star input in half-star steps: each star is two invisible half-width
 * hit zones over one fractional-fill display, Letterboxd-style.
 */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="flex items-center gap-3" onMouseLeave={() => setHover(null)}>
      <div className="relative inline-block">
        <Stars value={shown} size={30} />
        <div className="absolute inset-0 flex" role="radiogroup" aria-label="score">
          {Array.from({ length: 10 }, (_, i) => {
            const step = (i + 1) / 2;
            return (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={value === step}
                aria-label={`${step} stars`}
                className="flex-1 cursor-pointer opacity-0"
                onMouseEnter={() => setHover(step)}
                onFocus={() => setHover(step)}
                onBlur={() => setHover(null)}
                onClick={() => onChange(step)}
              />
            );
          })}
        </div>
      </div>
      <span className="w-8 text-sm font-bold text-dim tabular-nums">
        {shown > 0 ? shown.toFixed(1) : '—'}
      </span>
    </div>
  );
}
