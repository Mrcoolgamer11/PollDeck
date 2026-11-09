/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        rounded: ['"Nunito Variable"', '"Inter Variable"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f3f0ff",
          100: "#e9e3ff",
          200: "#d4c9ff",
          300: "#b4a0ff",
          400: "#9474ff",
          500: "#7c5cff",
          600: "#6a3ff5",
          700: "#5a2fd9",
          800: "#4a28b0",
          900: "#3d258c",
        },
      },
      keyframes: {
        floatUp: {
          "0%": { transform: "translateY(0) scale(0.6)", opacity: "0" },
          "10%": { opacity: "1", transform: "translateY(-5vh) scale(1)" },
          "100%": { transform: "translateY(-85vh) scale(1.2)", opacity: "0" },
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        rise: {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" },
        },
        ticker: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      animation: {
        floatUp: "floatUp 3.2s ease-out forwards",
        pop: "pop 0.35s ease-out both",
        rise: "rise 0.8s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};
