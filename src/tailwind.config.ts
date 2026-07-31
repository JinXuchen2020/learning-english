import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        seed: {
          bg: "var(--seed-bg)",
          fg: "var(--seed-fg)",
          primary: "var(--seed-primary)",
          accent: "var(--seed-accent)",
          surface: "var(--seed-surface)",
        },
        kids: {
          cream: "#F8F8F0",
          card: "#F7F3DF",
          secondary: "#F0E8D8",
          title: "#794F27",
          text: "#725D42",
          muted: "#9F927D",
          disabled: "#C4B89E",
          mint: "#19C8B9",
          "mint-hover": "#3DD4C6",
          "mint-active": "#11A89B",
          "mint-wash": "#E6F9F6",
          sun: "#FFCC00",
          "sun-shadow": "#E0B800",
          leaf: "#6FBA2C",
          "leaf-active": "#5A9E1E",
          warning: "#F5C31C",
          danger: "#E05A5A",
          pink: "#F8A6B2",
          purple: "#B77DEE",
          blue: "#889DF0",
          orange: "#E59266",
          teal: "#82D5BB",
        },
      },
      borderRadius: {
        seed: "var(--seed-radius)",
        control: "50px",
        card: "20px",
        panel: "24px",
      },
      fontFamily: {
        sans: [
          "var(--font-nunito)",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      boxShadow: {
        button: "0 5px 0 0 #BDAEA0",
        "button-hover": "0 6px 0 0 #BDAEA0",
        "button-active": "0 1px 0 0 #BDAEA0",
        input: "0 3px 0 0 #D4C9B4",
        card: "0 4px 10px rgba(107, 92, 67, 0.12)",
        "card-hover": "0 8px 24px rgba(114, 93, 66, 0.15)",
      },
      keyframes: {
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-green": {
          "0%": { boxShadow: "0 0 0 0 rgba(111, 186, 44, 0.4)" },
          "70%": { boxShadow: "0 0 0 12px rgba(111, 186, 44, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(111, 186, 44, 0)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(3px)" },
        },
        "star-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "50%": { transform: "scale(1.3)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        bounce: "bounce 2s ease-in-out infinite",
        "pulse-green": "pulse-green 0.6s ease-out",
        shake: "shake 0.4s ease-in-out",
        "star-pop": "star-pop 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
