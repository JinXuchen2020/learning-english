import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Polyfill the SWC-injected `__name` helper.
// Root cause: Next 14.2's SWC transform emits `__name(fn, name)` calls in client
// chunks but, under some build conditions, fails to define the helper — causing
// runtime `__name is not defined`, React failing to mount, and page navigation
// RSC requests aborted. The earlier `swcMinify: false` workaround was unreliable
// (the option is ignored in some Next 14.2 builds, and the helper is emitted by
// the transform, not just the minifier). Defining `__name` as a global on
// `globalThis` at the top of every chunk guarantees any reference resolves,
// regardless of which minifier runs.
const NAME_HELPER_POLYFILL = `(function(){if(typeof globalThis.__name==="undefined"){globalThis.__name=function(fn,name){try{return Object.defineProperty(fn,"name",{value:name,configurable:true});}catch(e){return fn;}};}}})();`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: `swcMinify` left at Next default. The `NAME_HELPER_POLYFILL` below is
  // the real fix; disabling minification here is ineffective and only slows CI.
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.BannerPlugin({
        banner: NAME_HELPER_POLYFILL,
        raw: true,
        entryOnly: false,
      })
    );
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
