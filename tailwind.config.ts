import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: "#0a0f1a",
          900: "#111827",
          800: "#1a2332",
          700: "#1f2b3d",
          600: "#2a3a52",
        },
        accent: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        positive: {
          DEFAULT: "#22c55e",
          light: "#4ade80",
        },
        negative: {
          DEFAULT: "#ef4444",
          light: "#f87171",
        },
        muted: {
          DEFAULT: "#9ca3af",
          dark: "#6b7280",
          light: "#d1d5db",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      borderColor: {
        DEFAULT: "#1f2b3d",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "accent-gradient": "linear-gradient(135deg, #3b82f6, #8b5cf6)",
        "score-gradient": "linear-gradient(90deg, #3b82f6, #22c55e)",
      },
    },
  },
  plugins: [],
};
export default config;
