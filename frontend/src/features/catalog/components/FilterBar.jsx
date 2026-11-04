import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'low', label: 'Price: Low to High' },
  { value: 'high', label: 'Price: High to Low' },
];

function SortDropdown({ sort, onSort }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedIndex = Math.max(0, SORT_OPTIONS.findIndex((option) => option.value === sort));
  const selectedOption = SORT_OPTIONS[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  const choose = (option) => {
    onSort(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event) => {
    const currentIndex = optionRefs.current.indexOf(document.activeElement);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % SORT_OPTIONS.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = SORT_OPTIONS.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else {
      return;
    }

    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div ref={rootRef} className="relative z-40 w-48 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Sort products. Current sort: ${selectedOption.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="sort-products-menu"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="glass focus-ring flex h-11 w-full items-center justify-between rounded-full border border-ink/30 px-4 text-left text-sm font-medium tracking-[-0.01em] text-ink shadow-sm transition-colors hover:bg-surface/60 dark:border-white/25"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-mute transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id="sort-products-menu"
          role="menu"
          aria-label="Sort products"
          onKeyDown={handleMenuKeyDown}
          className="glass-panel absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl p-1.5"
        >
          {SORT_OPTIONS.map((option, index) => {
            const selected = option.value === sort;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => choose(option)}
                className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-ink/[0.08] font-semibold text-ink dark:bg-white/[0.12]'
                    : 'text-charcoal/80 hover:bg-ink/[0.06] hover:text-ink dark:text-charcoal dark:hover:bg-white/[0.08]'
                }`}
              >
                <span>{option.label}</span>
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Returns siblings so the pill bar can stay sticky for the whole shop section. */
export default function FilterBar({ categories, active, onChange, counts, sort, onSort, shown }) {
  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-6">
        <div id="categories" className="scroll-mt-28">
          <p className="eyebrow">Shop</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">The Collection</h2>
        </div>
        <p className="pb-1 text-sm tabular-nums text-mute" aria-live="polite">
          {shown} {shown === 1 ? 'piece' : 'pieces'}
        </p>
      </div>

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
                  {on && <span className="glass-dark absolute inset-0 rounded-full" />}
                  <span className="relative z-10">
                    {c}
                    <span className={`ml-1.5 text-xs tabular-nums ${on ? 'text-onsolid/55' : 'text-mute'}`}>{counts[c]}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <SortDropdown sort={sort} onSort={onSort} />
        </div>
      </div>
    </>
  );
}
