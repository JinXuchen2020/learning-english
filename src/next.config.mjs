import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // AI-713/CI fix: 禁用 SWC 压缩。Next 14.2.x 的 SWC minifier 在 App Router
  // 客户端 chunk 中偶发漏注入 `__name` helper，导致运行时 `__name is not defined`、
  // React 无法挂载、页面导航 ERR_ABORTED。本地 `next dev` 不压缩故不暴露，CI 用
  // `next build`+`next start` 中招。关闭压缩后 bundle 略大但行为正确。
  swcMinify: false,
  env: {
    // NEXT_PUBLIC_* variables are inlined at build time. On Vercel we default
    // to the production API; local development falls back to localhost:4000.
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL
        ? "https://learning-english-api.vercel.app/api"
        : "http://localhost:4000/api"),
  },
};

export default withNextIntl(nextConfig);
