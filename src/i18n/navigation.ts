import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation primitives. Use these instead of `next/link` and
// `next/navigation` so that every internal href is automatically prefixed with
// the active locale (e.g. `/practice` -> `/zh/practice`). This keeps client-side
// SPA navigation working without ever dropping the in-memory auth token.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
