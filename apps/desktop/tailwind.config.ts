import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../libs/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0a1f3d',
          800: '#0f2944',
          700: '#1f3a5f',
          600: '#2c4a73',
          50: '#f1f4f9',
        },
        gold: {
          500: '#c7a44a',
          400: '#d4b56b',
          300: '#e1c891',
        },
        ink: '#0c1b2e',
        cream: '#ece6d3',
        'cream-dim': '#bdb59f',
        bull: '#5fcf9a',
        bear: '#e57373',
        canvas: '#f8fafc',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        serif: ['Georgia', 'Source Serif Pro', 'serif'],
        mono: ['Menlo', 'Consolas', 'monospace'],
        display: ['Fraunces', 'Georgia', 'serif'],
        grotesk: ['"Instrument Sans"', '-apple-system', 'Helvetica Neue', 'sans-serif'],
        ticker: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 41 68 / 0.04), 0 1px 3px 0 rgb(15 41 68 / 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
