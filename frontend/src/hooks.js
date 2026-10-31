import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / sandboxed iframe) — state stays in memory */
  }
}

export function usePersistentState(key, initial) {
  const [state, setState] = useState(() => loadJSON(key, initial));
  useEffect(() => saveJSON(key, state), [key, state]);
  return [state, setState];
}

export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [locked]);
}

export function useEscape(active, handler) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === 'Escape' && handler();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handler]);
}

/* ---------------- Theme ---------------- */
const THEME_KEY = 'strawp.theme';
const THEME_COLOR = { light: '#f6f5f2', dark: '#0c0c0d' };

function savedTheme() {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/**
 * Light/dark theme. Follows the OS until the visitor picks one, then remembers it.
 * toggle(origin) reveals the new theme as a circle expanding from `origin` ({x, y}) where
 * the View Transitions API exists; elsewhere it cross-fades colours.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => savedTheme() ?? systemTheme());

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => !savedTheme() && setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const toggle = useCallback(
    (origin) => {
      const next = theme === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        /* not persisted */
      }
      const commit = () => {
        applyTheme(next);
        flushSync(() => setTheme(next));
      };
      const root = document.documentElement;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      if (!document.startViewTransition || reduceMotion) {
        root.classList.add('theme-fade');
        commit();
        window.setTimeout(() => root.classList.remove('theme-fade'), 600);
        return;
      }

      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? 0;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const transition = document.startViewTransition(commit);
      transition.ready
        .then(() =>
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
          ),
        )
        .catch(() => {});
    },
    [theme],
  );

  return [theme, toggle];
}
