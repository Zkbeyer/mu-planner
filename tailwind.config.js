/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        black: '#0a0a0a',
        gold: '#F1B82D',
        'gold-dark': '#c9940a',
        off: '#f5f3ef',
        g100: '#f0ede8',
        g200: '#e0dcd5',
        g400: '#9a9390',
        g600: '#5a534e',
        'mu-green': '#1a7a3c',
        'green-bg': '#e6f4ec',
        'mu-yellow': '#8a6200',
        'yellow-bg': '#fff8e1',
        'mu-red': '#9b1c1c',
        'red-bg': '#fde8e8',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        syne: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      boxShadow: {
        hard: '4px 4px 0 #0a0a0a',
        'hard-sm': '2px 2px 0 #0a0a0a',
        'hard-gold': '3px 3px 0 #F1B82D',
      },
    },
  },
  plugins: [],
};
