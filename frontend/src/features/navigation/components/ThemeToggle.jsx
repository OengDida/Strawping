import { Sun, Moon } from 'lucide-react';

const centerOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function ThemeToggle({ theme, onToggle, className = '' }) {
  const dark = theme === 'dark';
  return <button type="button" onClick={(e) => onToggle(centerOf(e.currentTarget))}
    aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}
    className={`focus-ring relative grid h-10 w-10 place-items-center rounded-full text-ink transition duration-300 hover:bg-surface/70 active:scale-90 ${className}`}>
    {dark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
  </button>;
}

export function ThemeSwitchRow({ theme, onToggle }) {
  const dark = theme === 'dark';
  return <button type="button" role="switch" aria-checked={dark}
    onClick={(e) => onToggle(centerOf(e.currentTarget.querySelector('[data-knob]') ?? e.currentTarget))}
    className="focus-ring flex w-full items-center justify-between rounded-xl px-4 py-3 text-[15px] transition hover:bg-surface/60">
    <span className="flex items-center gap-3">{dark ? <Moon className="h-4 w-4" strokeWidth={1.8} /> : <Sun className="h-4 w-4" strokeWidth={1.8} />}Dark mode</span>
    <span className={`relative flex h-7 w-12 items-center rounded-full p-0.5 transition-colors duration-300 ${dark ? 'bg-accent' : 'bg-ink/10'}`}>
      <span data-knob className={`h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.25)] transition-transform ${dark ? 'translate-x-5' : ''}`} />
    </span>
  </button>;
}
