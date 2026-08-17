import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Polyfill the SWC-injected `__name` helper via webpack entry injection.
// See src/__name-polyfill.js for the full root-cause analysis. We prepend that
// module to every entry so `globalThis.__name` is defined before any transpiled
// chunk calls it — WITHOUT corrupting file syntax the way a raw BannerPlugin
// banner did (which made Next's Terser throw "Expected ',', got '}'" while
// parsing the injected files). The polyfill is a self-contained valid module,
// so Terser parses it cleanly and the global helper resolves at runtime.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    const polyfillPath = fileURLToPath(
      new URL("./__name-polyfill.js", import.meta.url)
    );
    const originalEntry = config.entry;
    config.entry = async () => {
      const entries = await originalEntry();
      for (const key of Object.keys(entries)) {
        const entry = entries[key];
        if (Array.isArray(entry)) {
          entries[key] = [polyfillPath, ...entry];
        } else if (typeof entry === "string") {
          entries[key] = [polyfillPath, entry];
        }
        // function / object-form entries are left untouched (Next handles them).
      }
      return entries;
    };
    return config;
  },
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
