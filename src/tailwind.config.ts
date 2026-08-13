import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // ── 响应式断点（移动优先，显式声明以保持一致） ──
      screens: {
        sm: "640px", // 大手机 / 小平板
        md: "768px", // 平板竖屏
        lg: "1024px", // 平板横屏 / 小桌面
        xl: "1280px", // 桌面
        "2xl": "1536px", // 大桌面
      },
      // ── 居中容器：随断点放大内边距与最大宽度 ──
      container: {
        center: true,
        padding: {
          DEFAULT: "1.25rem",
          sm: "1.5rem",
          lg: "2rem",
        },
        screens: {
          "2xl": "1280px",
        },
      },
      // ── 桌面端更宽的内容承载（配合 layout.tsx 使用） ──
      maxWidth: {
        kids: "72rem", // 1152px：平板横屏舒适宽度
        wide: "80rem", // 1280px：桌面
      },
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
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(25, 200, 185, 0.35)" },
          "70%": { boxShadow: "0 0 0 12px rgba(25, 200, 185, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(25, 200, 185, 0)" },
        },
        "pulse-sun": {
          "0%": { boxShadow: "0 0 0 0 rgba(255, 204, 0, 0.4)" },
          "70%": { boxShadow: "0 0 0 12px rgba(255, 204, 0, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255, 204, 0, 0)" },
        },
        shake: {
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
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        bounce: "bounce 2s ease-in-out infinite",
        "pulse-green": "pulse-green 0.6s ease-out",
        "pulse-ring": "pulse-ring 0.6s ease-out",
        "pulse-sun": "pulse-sun 0.6s ease-out",
        shake: "shake 0.4s ease-in-out",
        "star-pop": "star-pop 0.4s ease-out forwards",
        "fade-in": "fade-in 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
