/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        app: "var(--bg-app)",
        card: "var(--bg-card)",
        elevated: "var(--bg-elevated)",
        green: {
          DEFAULT: "var(--green-use)",
          hover: "var(--green-primary-hover)",
          soft: "var(--green-soft)",
        },
        ink: {
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
        },
        line: {
          card: "var(--border-card)",
          muted: "var(--border-muted)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        card: "var(--radius-card)",
      },
      width: {
        sidebar: "var(--sidebar-width)",
        aside: "var(--aside-width)",
      },
      height: {
        header: "var(--header-height)",
      },
    },
  },
  plugins: [],
};
