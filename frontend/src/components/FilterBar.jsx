import { motion } from 'framer-motion';
import { ChevronDown, ArrowUpDown } from 'lucide-react';
import Reveal from './Reveal.jsx';
import { spring } from '../motion.js';

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
            className="glass no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-full p-1"
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
                  className={`focus-ring relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors duration-300 ${
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

          <label className="glass relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full focus-within:ring-2 focus-within:ring-accent/70 sm:flex sm:h-auto sm:w-auto sm:focus-within:ring-0">
            <span className="sr-only">Sort products</span>
            <ArrowUpDown className="pointer-events-none h-4 w-4 sm:hidden" strokeWidth={1.8} />
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value)}
              className="sm:focus-ring absolute inset-0 cursor-pointer appearance-none rounded-full bg-transparent text-sm opacity-0 outline-none sm:static sm:py-2.5 sm:pl-4 sm:pr-9 sm:opacity-100"
            >
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 hidden h-4 w-4 text-mute sm:block" />
          </label>
        </div>
      </div>
    </>
  );
}
