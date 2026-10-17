/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/assets/app.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0F172A',
          navy: '#1E293B',
          gold: '#D97706',
          goldHover: '#B45309',
          goldLight: '#FEF3C7',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
