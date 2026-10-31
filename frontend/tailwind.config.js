/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
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
