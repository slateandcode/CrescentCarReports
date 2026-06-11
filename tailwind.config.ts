import type { Config } from 'tailwindcss'

/**
 * Crescent Car Reports shares the Crescent Car Check brand palette: a premium
 * near-black dark theme with a single gold accent (#FFC600). Status colours
 * (pass / attention / fail / n-a) are first-class because the whole inspector
 * tool and report document are built around them.
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        // A true phone breakpoint. Was 420px, which sits ABOVE the 360–390px
        // iPhones inspectors actually use, so xs:-gated UI (issue tally, section
        // status badge, paint options) was hidden/cramped on real phones.
        xs: '360px',
      },
      colors: {
        background: '#0A0A0A',
        surface: '#111111',
        card: '#1A1A1A',
        'card-hover': '#1F1F1F',
        border: '#2A2A2A',
        'border-hover': '#3A3A3A',
        accent: '#FFC600',
        'accent-hover': '#E6B200',
        'accent-muted': 'rgba(255,198,0,0.08)',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A0A0A0',
        'text-muted': '#555555',

        // Light surfaces — used by the printable report document.
        'doc-bg': '#FFFFFF',
        'doc-surface': '#F7F7F5',
        'doc-border': '#E4E4E0',
        'doc-ink': '#0A0A0A',
        'doc-muted': '#6B6B6B',

        // Inspection status palette.
        pass: '#22C55E',
        'pass-muted': 'rgba(34,197,94,0.12)',
        attention: '#F59E0B',
        'attention-muted': 'rgba(245,158,11,0.12)',
        fail: '#EF4444',
        'fail-muted': 'rgba(239,68,68,0.12)',
        na: '#6B7280',
        'na-muted': 'rgba(107,114,128,0.12)',

        success: '#22C55E',
        error: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '700' }],
        'display-sm': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-xs': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
      },
      borderRadius: {
        card: '12px',
        'card-lg': '16px',
        input: '10px',
        tag: '6px',
      },
      boxShadow: {
        card: '0 0 0 1px #2A2A2A',
        'card-hover': '0 0 0 1px #FFC600, 0 8px 32px rgba(255,198,0,0.06)',
        'input-focus': '0 0 0 3px rgba(255,198,0,0.2)',
        'input-error': '0 0 0 3px rgba(239,68,68,0.2)',
        glow: '0 0 40px rgba(255,198,0,0.12)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'fade-in-up': 'fadeInUp 0.4s ease forwards',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.32,0.72,0,1) forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}

export default config
