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
