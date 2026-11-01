import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Reveal from '../../../shared/components/Reveal.jsx';
import { spring } from '../../../shared/motion.js';

/** Returns siblings so the pill bar can stay sticky for the whole shop section. */
export default function FilterBar({ categories, active, onChange, counts, sort, onSort, shown }) {
  return (
    <>
      <Reveal className="mb-8 flex items-end justify-between gap-6">
        <div id="categories" className="scroll-mt-28">
          <p className="eyebrow">Shop</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">The Collection</h2>
        </div>
        <p className="pb-1 text-sm tabular-nums text-mute" aria-live="polite">
          {shown} {shown === 1 ? 'piece' : 'pieces'}
        </p>
      </Reveal>

      <div className="sticky top-[76px] z-30 -mx-5 mb-10 px-5 py-2">
        <div className="flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter by category"
            className="glass no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-full border border-ink/30 p-1 dark:border-white/20"
          >
            {categories.map((c) => {
              const on = c === active;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onChange(c)}
                  className={`focus-ring relative shrink-0 rounded-full border border-ink/25 px-4 py-2 text-sm transition-colors duration-300 dark:border-white/20 ${
                    on ? 'text-onsolid' : 'text-charcoal/70 hover:bg-surface/50 hover:text-ink'
                  }`}
                >
                  {on && <motion.span layoutId="active-pill" className="glass-dark absolute inset-0 rounded-full" transition={spring} />}
                  <span className="relative z-10">
                    {c}
                    <span className={`ml-1.5 text-xs tabular-nums ${on ? 'text-onsolid/55' : 'text-mute'}`}>{counts[c]}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="glass relative flex h-11 w-48 shrink-0 items-center rounded-full border border-ink/30 px-4 pr-10 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-accent/70 dark:border-white/25 sm:focus-within:ring-0">
            <span className="sr-only">Sort products</span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value)}
              className="focus-ring relative z-10 h-full w-full cursor-pointer appearance-none rounded-full bg-transparent py-2 text-sm font-medium tracking-[-0.01em] text-ink outline-none"
            >
              <option className="bg-paper text-ink" value="featured">Featured</option>
              <option className="bg-paper text-ink" value="low">Price: Low to High</option>
              <option className="bg-paper text-ink" value="high">Price: High to Low</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-mute" />
          </label>
        </div>
      </div>
    </>
  );
}
