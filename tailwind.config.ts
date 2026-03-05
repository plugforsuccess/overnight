import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#F1F3F8",
          100: "#DCE2EE",
          200: "#B9C5DD",
          300: "#8FA3C7",
          400: "#6580AD",
          500: "#3F5B8A",
          600: "#2B4470",
          700: "#1D2A3F",
          800: "#162235",
          900: "#0F1A2B",
        },
        accent: {
          50: "#FEF7F0",
          100: "#FDEDD9",
          200: "#F9D5AD",
          300: "#F0B271",
          400: "#E0893E",
          500: "#D87A3F",
          600: "#C56A2D",
          700: "#A35425",
          800: "#854520",
          900: "#6D391C",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        "soft-sm": "0 1px 3px 0 rgba(15, 26, 43, 0.06), 0 1px 2px -1px rgba(15, 26, 43, 0.06)",
        "soft-md": "0 4px 8px -1px rgba(15, 26, 43, 0.08), 0 2px 4px -2px rgba(15, 26, 43, 0.04)",
        "soft-lg": "0 10px 20px -3px rgba(15, 26, 43, 0.10), 0 4px 6px -4px rgba(15, 26, 43, 0.05)",
      },
      borderRadius: {
        "xl": "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
