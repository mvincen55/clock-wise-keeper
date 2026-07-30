import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        purple: {
          DEFAULT: "#53406e",
          600: "#53406e",
          700: "#44345b",
          500: "#6b5389",
          200: "#c9bcda",
          100: "#e7e2ee",
          50: "#f3f0f7",
        },
        ink: "#17141C",
        paper: "#FBFAFC",
        carbon: "#E7E2EE",
        deep: "#2E2440",
        flag: {
          DEFAULT: "#B4342A",
          /* Same signal, legible on the deep aubergine grounds. */
          light: "#F0B8B3",
        },
      },
      fontFamily: {
        display: ["'Archivo Variable'", "Archivo", "system-ui", "sans-serif"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      maxWidth: {
        prose: "62ch",
      },
      transitionDuration: {
        DEFAULT: "180ms",
      },
    },
    // Sharp, non-rounded edges are a brand constraint, not a preference.
    // Zeroing the scale makes a rounded corner impossible to introduce by accident.
    borderRadius: {
      none: "0",
      sm: "0",
      DEFAULT: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "0",
    },
  },
  plugins: [],
} satisfies Config;
