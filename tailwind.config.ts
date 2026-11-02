import type { Config } from "tailwindcss";

/**
 * Design tokens live here so every component shares one palette.
 * Palette: cool paper background, deep ink text, a single cobalt accent
 * and a small amber "signal" colour reserved for stock/sale messaging.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F8",
        surface: "#FFFFFF",
        ink: "#17202A",
        slate: "#5B6B7B",
        line: "#D9DFE5",
        accent: { DEFAULT: "#2F5BEA", dark: "#2447BC" },
        signal: "#B7791F",
        danger: "#B42318",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
