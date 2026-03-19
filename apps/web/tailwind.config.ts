import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        thai: ['Anuphan', 'sans-serif'],
        'mono-data': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        micro: ['0.5625rem', { lineHeight: '1.4' }],    // 9px
        caption: ['0.625rem', { lineHeight: '1.4' }],    // 10px
        label: ['0.6875rem', { lineHeight: '1.45' }],    // 11px
        small: ['0.75rem', { lineHeight: '1.5' }],       // 12px
        body: ['0.875rem', { lineHeight: '1.6' }],       // 14px
        subhead: ['1rem', { lineHeight: '1.5' }],        // 16px
        heading: ['1.125rem', { lineHeight: '1.4' }],    // 18px
        display: ['1.5rem', { lineHeight: '1.3' }],      // 24px
      },
      spacing: {
        unit: '4px',
        'unit-2': '8px',
        'unit-3': '12px',
        'unit-4': '16px',
        'unit-5': '20px',
        'unit-6': '24px',
        'unit-8': '32px',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          dim: 'hsl(var(--accent-dim))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        bullish: 'hsl(var(--bullish))',
        bearish: 'hsl(var(--bearish))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        panel: 'var(--shadow-panel)',
        modal: 'var(--shadow-modal)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'var(--ease-out)',
        'ease-in-out-smooth': 'var(--ease-in-out)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px hsl(var(--accent) / 0.15)' },
          '50%': { boxShadow: '0 0 12px hsl(var(--accent) / 0.3)' },
        },
        'scroll-ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'scroll-ticker': 'scroll-ticker 45s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
