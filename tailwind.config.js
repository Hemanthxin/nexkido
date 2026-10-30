module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0F1D2E", paper: "#F6FAFD", sky: "#CFE6F8", sun: "#FFB81C", ok: "#14805A", bad: "#C8312B" },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
