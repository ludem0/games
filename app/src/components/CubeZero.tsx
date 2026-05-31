export default function CubeZero() {
  return (
    <svg width="120" height="130" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Dark metal horns */}
      <path d="M38 28 L60 16 L82 28 L82 22 L60 10 L38 22 Z" fill="#555" />
      <path d="M38 22 L38 28 L34 26 L34 20 Z" fill="#333" />
      <path d="M82 22 L82 28 L86 26 L86 20 Z" fill="#333" />
      <path d="M34 20 L60 8 L86 20 L60 10 Z" fill="#666" />

      {/* Top face — near white */}
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="#E8E8E8" />
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="url(#topZero)" />

      {/* Left face — mid grey */}
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="#BDBDBD" />
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="url(#leftZero)" />

      {/* Right face — dark grey */}
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="#888" />
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="url(#rightZero)" />

      {/* Dark bottom frame */}
      <path d="M38 78 L60 90 L82 78 L82 82 L60 94 L38 82 Z" fill="#444" />
      <path d="M38 78 L38 82 L34 80 L34 76 Z" fill="#2A2A2A" />
      <path d="M82 78 L82 82 L86 80 L86 76 Z" fill="#2A2A2A" />

      {/* Minimal white gem */}
      <path d="M55 42 L60 38 L65 42 L60 50 Z" fill="rgba(255,255,255,0.7)" />
      <path d="M60 50 L55 42 L60 56 Z" fill="rgba(255,255,255,0.25)" />

      <defs>
        <linearGradient id="topZero" x1="38" y1="16" x2="82" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.5" />
          <stop offset="100%" stopColor="white" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="leftZero" x1="38" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="rightZero" x1="82" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  )
}
