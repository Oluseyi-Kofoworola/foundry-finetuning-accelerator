/** @type {import('tailwindcss').Config} */

// Brand color tokens are driven by CSS variables defined in
// src/styles/globals.css (:root). This makes the whole app rebrandable from a
// single place — `npm run apply:config` rewrites those variables from
// /config/client.config.json. The `acme` alias is kept for backward
// compatibility so existing `acme-*` class names keep working.
const brandColors = {
  primary: 'rgb(var(--brand-primary) / <alpha-value>)',
  secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
  accent: 'rgb(var(--brand-accent) / <alpha-value>)',
  success: 'rgb(var(--brand-success) / <alpha-value>)',
  warning: 'rgb(var(--brand-warning) / <alpha-value>)',
  error: 'rgb(var(--brand-error) / <alpha-value>)',
  dark: 'rgb(var(--brand-dark) / <alpha-value>)',
  light: 'rgb(var(--brand-light) / <alpha-value>)',
};

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: brandColors,
        // Backward-compatible alias — existing `acme-*` utilities resolve to
        // the same CSS-variable-driven brand palette.
        acme: brandColors,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'wave 1.5s ease-in-out infinite',
        'bounce-gentle': 'bounce 2s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(2)' },
        },
      },
    },
  },
  plugins: [],
}
