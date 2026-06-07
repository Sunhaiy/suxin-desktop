import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        primaryLight: 'var(--primary-light-color)',
        primaryDark: 'var(--primary-dark-color)',
        primaryContrast: 'var(--primary-contrast-color)',
        secondary: 'var(--secondary-color)',
        secondaryLight: 'var(--secondary-light-color)',
        secondaryDark: 'var(--secondary-dark-color)',
        accent: 'var(--accent-color)',
        accentLight: 'var(--accent-light-color)',
        accentDark: 'var(--accent-dark-color)',
        accentContrast: 'var(--accent-contrast-color)',
        divider: 'var(--divider-color)',
        dividerLight: 'var(--divider-light-color)',
        dividerDark: 'var(--divider-dark-color)',
        tooltip: 'var(--tooltip-color)',
        popover: 'var(--popover-color)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        tiny: 'var(--font-size-tiny)',
        body: 'var(--font-size-body)',
      },
      lineHeight: {
        body: 'var(--line-height-body)',
      },
      spacing: {
        '0.25': '0.0625rem',
        '0.75': '0.1875rem',
      },
    },
  },
  plugins: [],
} satisfies Config
