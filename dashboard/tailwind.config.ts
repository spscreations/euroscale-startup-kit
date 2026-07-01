import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#070b1a", 800: "#0b1124", 700: "#0f162e", 600: "#141c3a" },
        purple: { 500: "#6d5dfd", 400: "#8b7eff", 300: "#a99fff" },
        cyan: { 400: "#22d3ee" },
        green: { 400: "#34d399" },
        gold: { 400: "#fbbf24" },
        glass: { bg: "rgba(15,22,46,0.6)", border: "rgba(109,93,253,0.15)" },
      },
      fontFamily: { inter: ["Inter", "system-ui", "sans-serif"] },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #6d5dfd, #a99fff, #22d3ee)",
      },
      animation: {
        shimmer: "shimmer 2s ease-in-out infinite",
        fade: "fade 0.3s ease-in-out",
        "slide-up": "slide-up 0.4s ease-out",
      },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
export default config;
