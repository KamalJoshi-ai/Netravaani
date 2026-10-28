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
        page: "#F5EFE6",           // Warm aged parchment
        surface: "#FAF6F0",        // Pure ivory ledger card
        surfaceSecondary: "#ECE3D4", // Vintage vellum well / muted tray
        border: "#DCD2C0",         // Fine antique rule border
        borderSubtle: "#E8E0D2",
        ink: {
          DEFAULT: "#28211B",      // Deep antique charcoal-sepia ink
          primary: "#28211B",
          secondary: "#6F6256",    // Aged sepia secondary
          muted: "#6F6256",
          faint: "#96887B",
        },
        vintage: {
          sienna: "#8C4327",       // Saddle sienna / leather accent
          terracotta: "#A35232",
          navy: "#1D2D38",         // Deep heritage seal navy
          brass: "#B88738",        // Antique brass / warm gold
          paper: "#F5EFE6",
          cream: "#FAF6F0",
          vellum: "#ECE3D4",
          leather: "#4A3525",
        },
        navy: {
          DEFAULT: "#1D2D38",      // Primary heritage seal navy
          hover: "#142028",
          active: "#0F181E",
          light: "#E9EEF0",
          border: "#C5D2D8",
        },
        teal: {
          DEFAULT: "#345C5A",      // Heritage muted sage/teal
          hover: "#264443",
          light: "#E7EFEF",
          border: "#AFC5C4",
        },
        accent: {
          DEFAULT: "#8C4327",      // Warm Sienna Accent
          hover: "#73341C",
          light: "#F7EFEB",
        },
        semantic: {
          success: "#2E6243",      // Vintage forest green
          successBg: "#EBF3ED",
          successBorder: "#BCD5C4",
          warning: "#A36F1C",      // Antique brass / ochre
          warningBg: "#FAF4E8",
          warningBorder: "#E8D2A8",
          error: "#9E3232",        // Vintage crimson
          errorBg: "#FAEEEE",
          errorBorder: "#E8BCBC",
        },
        // Dark Mode equivalents ("True Dark Black")
        dark: {
          page: "#050505",
          surface: "#0D0D0E",
          surfaceSecondary: "#141416",
          border: "#222226",
          text: "#F2ECE1",
          muted: "#9E9689",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "'Plus Jakarta Sans'", "'Inter'", "sans-serif"],
        sans: ["var(--font-sans)", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["var(--font-serif)", "'Newsreader'", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(24, 33, 43, 0.04)",
        subtle: "0 1px 3px 0 rgba(24, 33, 43, 0.05), 0 1px 2px -1px rgba(24, 33, 43, 0.03)",
        card: "0 1px 4px 0 rgba(24, 33, 43, 0.05), 0 2px 8px -2px rgba(24, 33, 43, 0.04)",
        dropdown: "0 10px 25px -5px rgba(24, 33, 43, 0.1), 0 8px 10px -6px rgba(24, 33, 43, 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
