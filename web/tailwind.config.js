/** Theme colours are CSS variables (src/index.css), so dark mode is one swap. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"Fraunces Variable"', "Georgia", "serif"],
      },
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
      },
      boxShadow: {
        page: "0 1px 2px rgb(0 0 0 / .06), 0 8px 24px -6px rgb(0 0 0 / .12), 0 24px 60px -24px rgb(0 0 0 / .18)",
        card: "0 1px 2px rgb(0 0 0 / .05), 0 4px 16px -4px rgb(0 0 0 / .08)",
        lift: "0 2px 4px rgb(0 0 0 / .06), 0 16px 40px -12px rgb(0 0 0 / .22)",
      },
    },
  },
  plugins: [],
};
