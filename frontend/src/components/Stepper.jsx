import { Minus, Plus } from 'lucide-react';

export default function Stepper({ value, onChange, min = 1, max = 9, compact = false, label = 'Quantity' }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center rounded-full border border-ink/10 bg-surface/60 ${compact ? 'h-8' : 'h-12'}`}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={`focus-ring grid h-full place-items-center rounded-full text-charcoal transition hover:text-ink active:scale-90 disabled:opacity-30 ${compact ? 'w-8' : 'w-11'}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center text-sm tabular-nums" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={`focus-ring grid h-full place-items-center rounded-full text-charcoal transition hover:text-ink active:scale-90 disabled:opacity-30 ${compact ? 'w-8' : 'w-11'}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
