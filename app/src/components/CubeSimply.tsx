export default function CubeSimply() {
  return (
    <svg width="120" height="130" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Silver horns / top frame */}
      <path d="M38 28 L60 16 L82 28 L82 22 L60 10 L38 22 Z" fill="#C0C8D0" />
      <path d="M38 22 L38 28 L34 26 L34 20 Z" fill="#90989E" />
      <path d="M82 22 L82 28 L86 26 L86 20 Z" fill="#90989E" />
      <path d="M34 20 L60 8 L86 20 L60 10 Z" fill="#D8E0E8" />

      {/* Top face — light blue */}
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="#C8E6FF" />
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="url(#topSimply)" />

      {/* Left face */}
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="#A8CEE8" />
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="url(#leftSimply)" />

      {/* Right face */}
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="#7BB3D4" />
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="url(#rightSimply)" />

      {/* Silver bottom frame */}
      <path d="M38 78 L60 90 L82 78 L82 82 L60 94 L38 82 Z" fill="#A0A8B0" />
      <path d="M38 78 L38 82 L34 80 L34 76 Z" fill="#808890" />
      <path d="M82 78 L82 82 L86 80 L86 76 Z" fill="#808890" />

      {/* Inner crystal gem highlight */}
      <path d="M55 42 L60 38 L65 42 L60 52 Z" fill="rgba(255,255,255,0.6)" />
      <path d="M60 52 L55 42 L60 58 Z" fill="rgba(255,255,255,0.3)" />

      <defs>
        <linearGradient id="topSimply" x1="38" y1="16" x2="82" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.4" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftSimply" x1="38" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="black" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="rightSimply" x1="82" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.25" />
        </linearGradient>
      </defs>
    </svg>
  )
}
