/** @type {import('tailwindcss').Config} */
import { fileURLToPath } from 'node:url';

// Resolve content globs relative to this file, not process.cwd(). The root `npm run build`
// (what Vercel runs) starts in the repo root, where './src/**' matches nothing and Tailwind
// would purge nearly every class from the stylesheet.
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [here('./index.html'), here('./src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        ink: token('ink'), // primary text / solid fills
        charcoal: token('charcoal'),
        paper: token('paper'), // page background
        stone: token('stone'), // image wells
        mute: token('mute'),
        alloy: token('alloy'),
        surface: token('surface'), // translucent hover / field fills
        onsolid: token('onsolid'), // text on solid ink fills
        accent: '#d4561c', // burnt orange
      },
      letterSpacing: { tightest: '-0.055em' },
      boxShadow: { lift: 'var(--shadow-lift)' },
    },
  },
  plugins: [],
};
