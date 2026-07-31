import type { MascotExpression, MascotSize } from "@/lib/types";

interface MascotProps {
  expression?: MascotExpression;
  size?: MascotSize;
  className?: string;
}

const sizeMap: Record<MascotSize, number> = {
  small: 48,
  medium: 80,
  large: 120,
};

export default function Mascot({
  expression = "happy",
  size = "medium",
  className = "",
}: MascotProps) {
  const px = sizeMap[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block ${size === "large" ? "animate-bounce" : ""} ${className}`}
      role="img"
      aria-label={`Fox mascot feeling ${expression}`}
      data-component="Mascot"
    >
      {/* Body */}
      <ellipse cx="60" cy="82" rx="28" ry="26" fill="#F5A25D" />
      <ellipse cx="60" cy="88" rx="20" ry="18" fill="#FDF0E0" />

      {/* Head */}
      <circle cx="60" cy="48" r="26" fill="#F5A25D" />

      {/* Ears */}
      <path d="M38 30 L32 10 L50 24 Z" fill="#F5A25D" />
      <path d="M82 30 L88 10 L70 24 Z" fill="#F5A25D" />
      <path d="M40 28 L36 14 L48 24 Z" fill="#FDF0E0" />
      <path d="M80 28 L84 14 L72 24 Z" fill="#FDF0E0" />

      {/* Face patch */}
      <ellipse cx="60" cy="54" rx="18" ry="15" fill="#FDF0E0" />

      {/* Eyes — expression variants */}
      {expression === "happy" && (
        <>
          <circle cx="50" cy="46" r="4" fill="#4A3520" />
          <circle cx="70" cy="46" r="4" fill="#4A3520" />
          <circle cx="51.5" cy="44.5" r="1.5" fill="#FFFFFF" />
          <circle cx="71.5" cy="44.5" r="1.5" fill="#FFFFFF" />
        </>
      )}
      {expression === "thinking" && (
        <>
          <circle cx="50" cy="46" r="4" fill="#4A3520" />
          <circle cx="70" cy="46" r="3.5" fill="#4A3520" />
          <circle cx="51.5" cy="44.5" r="1.5" fill="#FFFFFF" />
          {/* Raised eyebrow */}
          <path d="M65 38 Q70 35 75 38" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
      {expression === "celebrating" && (
        <>
          {/* Happy closed eyes */}
          <path d="M46 46 Q50 42 54 46" stroke="#4A3520" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M66 46 Q70 42 74 46" stroke="#4A3520" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {expression === "encouraging" && (
        <>
          <circle cx="50" cy="46" r="4" fill="#4A3520" />
          <circle cx="70" cy="46" r="4" fill="#4A3520" />
          <circle cx="51.5" cy="44.5" r="1.5" fill="#FFFFFF" />
          <circle cx="71.5" cy="44.5" r="1.5" fill="#FFFFFF" />
          {/* Wink */}
          <path d="M66 46 Q70 43 74 46" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Nose */}
      <ellipse cx="60" cy="54" rx="4" ry="3" fill="#4A3520" />

      {/* Mouth — expression variants */}
      {expression === "happy" && (
        <path d="M54 59 Q60 64 66 59" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
      {expression === "thinking" && (
        <path d="M55 60 Q60 61 65 60" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
      {expression === "celebrating" && (
        <path d="M52 58 Q60 67 68 58" stroke="#4A3520" strokeWidth="2" fill="#FFFFFF" strokeLinecap="round" />
      )}
      {expression === "encouraging" && (
        <path d="M54 59 Q60 63 66 59" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}

      {/* Cheek blush */}
      <circle cx="42" cy="54" r="5" fill="#F8A6B2" opacity="0.5" />
      <circle cx="78" cy="54" r="5" fill="#F8A6B2" opacity="0.5" />

      {/* Leaf hat accessory */}
      <path d="M52 22 Q60 14 68 22 Q60 20 52 22 Z" fill="#6FBA2C" />
      <path d="M60 22 L60 16" stroke="#5A9E1E" strokeWidth="1.5" strokeLinecap="round" />

      {/* Arms */}
      {expression === "celebrating" ? (
        <>
          <path d="M34 78 Q26 68 30 60" stroke="#F5A25D" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M86 78 Q94 68 90 60" stroke="#F5A25D" strokeWidth="8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M34 80 Q28 84 30 90" stroke="#F5A25D" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M86 80 Q92 84 90 90" stroke="#F5A25D" strokeWidth="8" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Feet */}
      <ellipse cx="48" cy="106" rx="10" ry="6" fill="#E8914D" />
      <ellipse cx="72" cy="106" rx="10" ry="6" fill="#E8914D" />

      {/* Tail */}
      <path d="M88 90 Q102 85 100 72 Q98 65 92 68" stroke="#F5A25D" strokeWidth="8" fill="none" strokeLinecap="round" />
      <circle cx="100" cy="70" r="5" fill="#FDF0E0" />
    </svg>
  );
}
