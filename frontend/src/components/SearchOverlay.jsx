import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowUpRight } from 'lucide-react';
import { useEscape } from '../hooks.js';
import { ease } from '../motion.js';
import { formatPrice } from '../data.js';

export default function SearchOverlay({ open, onClose, onSelect, products = [] }) {
  const [query, setQuery] = useState('');
  useEscape(open, onClose);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => [p.name, p.category, p.description].join(' ').toLowerCase().includes(q));
  }, [query, products]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" key="search">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/20 dark:bg-black/55 backdrop-blur-md"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            initial={{ opacity: 0, y: -28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.45, ease }}
            className="glass-panel relative mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-[1.75rem] sm:mt-24"
          >
            <div className="flex items-center gap-3 border-b border-ink/[0.06] pl-5 pr-3">
              <Search className="h-5 w-5 shrink-0 text-mute" strokeWidth={1.8} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) {
                    e.preventDefault(); // stop Enter from also activating the next focused control
                    onSelect(results[0]);
                  }
                }}
                placeholder="Search helmets, gloves, luggage…"
                aria-label="Search products"
                className="h-16 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-mute/80"
              />
              <kbd className="hidden rounded-md border border-ink/10 px-1.5 py-0.5 text-[11px] text-mute sm:block">esc</kbd>
              <button type="button" onClick={onClose} aria-label="Close search" className="focus-ring grid h-9 w-9 place-items-center rounded-full transition hover:bg-surface/70">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="eyebrow px-5 pb-1 pt-4" aria-live="polite">
              {query.trim() ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'All products'}
            </p>
            <ul className="no-scrollbar max-h-[60svh] overflow-y-auto p-2">
              {results.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.35, ease }}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="focus-ring group flex w-full items-center gap-4 rounded-2xl p-2 text-left transition hover:bg-surface/80"
                  >
                    <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-stone object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-mute">{p.category}</span>
                    </span>
                    <span className="text-sm tabular-nums">{formatPrice(p.price)}</span>
                    <ArrowUpRight className="h-4 w-4 text-mute transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                  </button>
                </motion.li>
              ))}
              {results.length === 0 && (
                <li className="px-4 py-14 text-center text-sm text-mute">
                  No gear matches “{query}”. Try “carbon” or “waterproof”.
                </li>
              )}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
