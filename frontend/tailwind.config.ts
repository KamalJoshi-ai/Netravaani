import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        editorial: {
          bg: "#F5F0E8",         // Warm Beige Background
          surface: "#FFFCF7",    // Editorial Surface
          text: "#30251F",       // Espresso Text
          muted: "#75665D",      // Warm Muted Text
          faint: "#A2948B",      // Faint Editorial Label Text
          accent: "#C56845",     // Terracotta Accent
          accentHover: "#B05534",
          soft: "#EED9CD",       // Soft Terracotta Accent
          border: "#E7DFD4",     // Editorial Crisp Border
          borderDark: "#D6C7B7", // Darker Editorial Divider
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Playfair Display", "Newsreader", "Georgia", "serif"],
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
