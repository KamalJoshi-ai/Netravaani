import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#F5F1E9",           // Warm ivory page background
        surface: "#FFFCF7",        // White card surfaces
        surfaceMuted: "#F0EAE1",
        surfaceHover: "#F7F2EB",
        borderWarm: "#E5D9CA",     // Subtle warm borders
        borderLight: "#EDE4D8",
        ink: {
          primary: "#211C19",      // Primary clinical text
          secondary: "#76685F",    // Secondary metadata text
          muted: "#9E9086",
          faint: "#C8BEB4",
        },
        terracotta: {
          DEFAULT: "#AD5D3D",      // Terracotta primary actions
          hover: "#964F33",
          light: "#F5ECE6",
          border: "#E2C7B8",
          dark: "#7A3B22",
        },
        emergency: {
          DEFAULT: "#B42318",      // Deep emergency red
          hover: "#912018",
          bg: "#FEF3F2",
          border: "#FECDCA",
          dark: "#7A271A",
        },
        clinicalGreen: {
          DEFAULT: "#42765A",      // Success green
          hover: "#355F49",
          bg: "#EDF5F0",
          border: "#C5DDCF",
        },
        clinicalBlue: {
          DEFAULT: "#2B6CB0",
          bg: "#EBF3FB",
          border: "#C3DCF4",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "'Plus Jakarta Sans'", "sans-serif"],
        sans: ["var(--font-sans)", "'Inter'", "-apple-system", "sans-serif"],
        serif: ["'Newsreader'", "Georgia", "'Times New Roman'", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "14px",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(33, 28, 25, 0.04), 0 1px 2px -1px rgba(33, 28, 25, 0.03)",
        card: "0 1px 4px 0 rgba(33, 28, 25, 0.05), 0 2px 8px -2px rgba(33, 28, 25, 0.04)",
        hover: "0 4px 12px -2px rgba(33, 28, 25, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
