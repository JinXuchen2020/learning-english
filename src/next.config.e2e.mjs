// Local E2E build config — isolated distDir so `scripts/run-e2e-local.sh`
// can boot the frontend for Playwright without touching the (possibly stale
// or lock-contended) default `.next` directory that blocks `next dev`/`next start`
// on some local machines.
//
// Usage (see scripts/run-e2e-local.sh):
//   npx next dev  -c next.config.e2e.mjs -p 3000
//   npx next build -c next.config.e2e.mjs   # if you prefer a production build
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 独立产物目录：与默认 .next 隔离，避免本机 .next 损坏/锁冲突阻断 E2E 本地启动
  distDir: ".next-e2e",
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
