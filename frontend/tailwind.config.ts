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
        // Unified Clinical Modern Palette - High Contrast Solid Light
        canvas: {
          light: "#EEF2F6",
          dark: "#EEF2F6",
        },
        surface: {
          light: "#FFFFFF",
          mutedLight: "#E2E8F0",
          dark: "#FFFFFF",
          mutedDark: "#E2E8F0",
        },
        border: {
          light: "#CBD5E1",
          subtleLight: "#E2E8F0",
          dark: "#CBD5E1",
          subtleDark: "#E2E8F0",
        },
        brand: {
          DEFAULT: "#0F766E",
          hover: "#115E59",
          light: "#E6FFFA",
          dark: "#0F766E",
          darkHover: "#115E59",
        },
        ink: {
          primary: "#090D16",
          secondary: "#334155",
          muted: "#475569",
          faint: "#64748B",
          darkPrimary: "#090D16",
          darkSecondary: "#334155",
          darkMuted: "#475569",
        },
        // Backward-compatibility aliases mapped to modern tokens
        page: "#EEF2F6",
        surfaceSecondary: "#E2E8F0",
        borderSubtle: "#CBD5E1",
        navy: {
          DEFAULT: "#0F766E",
          hover: "#0D655E",
          active: "#0B534D",
          light: "#F0FDFA",
          border: "#CCFBF1",
        },
        teal: {
          DEFAULT: "#0F766E",
          hover: "#0D655E",
          light: "#F0FDFA",
          border: "#CCFBF1",
        },
        accent: {
          DEFAULT: "#0F766E",
          hover: "#0D655E",
          light: "#F0FDFA",
        },
        semantic: {
          success: "#16A34A",
          successBg: "#F0FDF4",
          successBorder: "#DCFCE7",
          warning: "#D97706",
          warningBg: "#FFFBEB",
          warningBorder: "#FEF3C7",
          error: "#DC2626",
          errorBg: "#FEF2F2",
          errorBorder: "#FEE2E2",
        },
        dark: {
          page: "#0A0D14",
          surface: "#111622",
          surfaceSecondary: "#182030",
          border: "#1E2738",
          text: "#F8FAFC",
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "'Plus Jakarta Sans'", "'Inter'", "sans-serif"],
        sans: ["var(--font-sans)", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        subtle: "0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)",
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 6px -2px rgba(15, 23, 42, 0.02)",
        dropdown: "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
