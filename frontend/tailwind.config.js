export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // "xs" was used throughout the header (hidden xs:flex, etc.) but never
      // defined — Tailwind silently drops unrecognized variants, so every
      // "hidden xs:flex" button (Journal, Goals, Mutual Scheduling) rendered
      // as permanently hidden at every screen width, not just on narrow
      // phones as intended.
      screens: {
        xs: '400px'
      },
      // "Ledger & Index" brand tokens — fixed brand colors, not Tailwind's
      // generic slate/blue/indigo defaults. See design reference:
      // https://claude.ai/artifact/XSTUR5zAgEYvw3RJyftLBm
      colors: {
        // "Aurora" app tokens (2026-11 redesign). Brand violet + gradient stops,
        // a soft lavender canvas, and the dark "night" used for hero cards.
        brand: {
          DEFAULT: '#5B4BFF',
          600: '#4A3AE0',
          violet: '#9B5CFF',
          pink: '#FF6FA8',
          soft: '#EEEBFF'
        },
        canvas: '#F6F5FB',
        night: '#141233',
        ink: {
          900: '#14181A',
          800: '#1E2320',
          700: '#2B312C'
        },
        paper: {
          50: '#EEF0E9',
          100: '#E3E6DB',
          200: '#D7DBC9'
        },
        line: {
          DEFAULT: '#C7CBB9',
          strong: '#AEB39C'
        },
        gold: {
          100: '#F4E3BE',
          500: '#D9972E',
          600: '#BD7F1C'
        },
        sage: {
          100: '#DCE4DA',
          500: '#5C7A66'
        },
        rose: {
          100: '#EEDAD5',
          500: '#B5574B'
        },
        muted: '#5B6058'
      },
      fontFamily: {
        sans: ['Heebo', 'Noto Sans Hebrew', 'system-ui', 'sans-serif'],
        display: ['Heebo', 'Rubik', 'Noto Sans Hebrew', 'system-ui', 'sans-serif'],
        he: ['Heebo', 'Noto Sans Hebrew', 'system-ui', 'sans-serif'],
        en: ['Work Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        stamp: '3px 3px 0 #14181A',
        'stamp-sm': '2px 2px 0 #14181A',
        'stamp-paper': '3px 3px 0 #EEF0E9',
        soft: '0 1px 0 rgba(14,16,32,.03), 0 8px 24px -12px rgba(40,30,120,.14)',
        glow: '0 12px 24px -12px rgba(91,75,255,.75)'
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out"
      }
    }
  },
  plugins: []
};
