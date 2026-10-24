/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        coral: 'var(--coral)',
        cobalt: 'var(--cobalt)',
        butter: 'var(--butter)',
        mint: 'var(--mint)',
      },
      fontFamily: { display: ['Fraunces', 'serif'], mono: ['JetBrains Mono', 'monospace'] },
    },
  },
  plugins: [],
}
