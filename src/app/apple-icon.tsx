import { ImageResponse } from "next/og";

// Fox English — Apple touch icon (180x180)
// Reuses the exact same Foxy face as icon.svg, embedded as an SVG data URI
// (the Satori-safe way to include custom vector art in an ImageResponse).

const foxSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
<rect width="120" height="120" rx="28" fill="#19C8B9"/>
<path d="M38 30 L32 10 L50 24 Z" fill="#F5A25D"/>
<path d="M82 30 L88 10 L70 24 Z" fill="#F5A25D"/>
<path d="M40 28 L36 14 L48 24 Z" fill="#FDF0E0"/>
<path d="M80 28 L84 14 L72 24 Z" fill="#FDF0E0"/>
<circle cx="60" cy="50" r="26" fill="#F5A25D"/>
<ellipse cx="60" cy="56" rx="18" ry="15" fill="#FDF0E0"/>
<circle cx="50" cy="48" r="4" fill="#4A3520"/>
<circle cx="70" cy="48" r="4" fill="#4A3520"/>
<circle cx="51.5" cy="46.5" r="1.4" fill="#FFFFFF"/>
<circle cx="71.5" cy="46.5" r="1.4" fill="#FFFFFF"/>
<ellipse cx="60" cy="56" rx="4" ry="3" fill="#4A3520"/>
<path d="M54 61 Q60 66 66 61" stroke="#4A3520" stroke-width="2" fill="none" stroke-linecap="round"/>
<circle cx="42" cy="56" r="5" fill="#F8A6B2" opacity="0.5"/>
<circle cx="78" cy="56" r="5" fill="#F8A6B2" opacity="0.5"/>
<path d="M52 24 Q60 16 68 24 Q60 22 52 24 Z" fill="#6FBA2C"/>
<path d="M60 24 L60 18" stroke="#5A9E1E" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const foxDataUri = "data:image/svg+xml;base64," + Buffer.from(foxSvg).toString("base64");

export const size = 180;
export const contentType = "image/png";

// OG image routes can't be statically prerendered on Windows: `@vercel/og`
// calls fileURLToPath on a relative URL during build and throws "Invalid URL".
// Render on-demand instead. No visual/behavior change on Linux/CI.
export const dynamic = "force-dynamic";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={size}
          height={size}
          src={foxDataUri}
          style={{ width: size, height: size }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
