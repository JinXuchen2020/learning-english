// Polyfill for the SWC-injected `__name` helper.
//
// Root cause: Next 14.2's SWC transform emits `__name(fn, name)` calls in client
// chunks but, under some build conditions, fails to define the helper — causing
// runtime `__name is not defined`, React failing to mount, and page navigation
// RSC requests aborted.
//
// Earlier attempts:
//   - `swcMinify: false` was ignored in some Next 14.2 builds (the helper is
//     emitted by the transform, not just the minifier), so it did not help.
//   - `BannerPlugin({ raw: true })` prepends bare code to EVERY file, which made
//     Next's Terser fail to parse the injected files (SyntaxError:
//     "Expected ',', got '}"). That is why it was replaced by this entry-based
//     injection: the polyfill is its own valid module loaded before any other
//     module, so `globalThis.__name` is defined before any top-level `__name(...)`
//     call in transpiled chunks, without corrupting any file's syntax.
if (typeof globalThis.__name === "undefined") {
  globalThis.__name = function __name(fn, name) {
    try {
      return Object.defineProperty(fn, "name", {
        value: name,
        configurable: true,
      });
    } catch (e) {
      return fn;
    }
  };
}
