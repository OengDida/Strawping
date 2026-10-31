import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingBag, Menu, X } from 'lucide-react';
import { ease } from '../motion.js';
import { ThemeToggle, ThemeSwitchRow } from './ThemeToggle.jsx';

const LINKS = [
  { label: 'Shop', href: '#shop' },
  { label: 'Categories', href: '#categories' },
  { label: 'About', href: '#about' },
];

function IconButton({ label, onClick, count = 0, children, className = '', expanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className={`focus-ring relative grid h-10 w-10 place-items-center rounded-full text-ink transition duration-300 hover:bg-surface/70 active:scale-90 ${className}`}
    >
      {children}
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 560, damping: 20 }}
          className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-paper"
        >
          {count}
        </motion.span>
      )}
    </button>
  );
}

export default function Navbar({ solid, cartCount, onCart, onSearch, theme, onToggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const glassOn = solid || menuOpen;

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5">
      <motion.nav
        aria-label="Primary"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease }}
        className="relative mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl pl-4 pr-2 sm:pl-5"
      >
        {/* Frosted layer fades in once the hero is scrolled past */}
        <span
          aria-hidden
          className={`glass pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500 ${glassOn ? 'opacity-100' : 'opacity-0'}`}
        />

        <a href="#top" className="focus-ring relative flex items-center gap-2.5 rounded-lg" aria-label="Strawping — home">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-ink text-[12px] font-bold tracking-tight text-onsolid">S</span>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            Strawping
          </span>
        </a>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="focus-ring rounded-full px-4 py-2 text-sm text-charcoal/75 transition duration-300 hover:bg-surface/60 hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="relative flex items-center">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} className="hidden sm:grid" />
          <IconButton label="Search products" onClick={onSearch}>
            <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label={`Bag, ${cartCount} items`} onClick={onCart} count={cartCount}>
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label={menuOpen ? 'Close menu' : 'Open menu'}
            expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </IconButton>
        </div>
      </motion.nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.3, ease }}
            className="glass mx-auto mt-2 max-w-7xl origin-top rounded-2xl p-2 md:hidden"
          >
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="focus-ring block rounded-xl px-4 py-3 text-[15px] transition hover:bg-surface/60"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-1 border-t border-ink/[0.06] pt-1">
              <ThemeSwitchRow theme={theme} onToggle={onToggleTheme} />
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </header>
  );
}
