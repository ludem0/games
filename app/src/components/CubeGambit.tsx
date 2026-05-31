export default function CubeGambit() {
  return (
    <svg width="120" height="130" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Gold horns */}
      <path d="M38 28 L60 16 L82 28 L82 22 L60 10 L38 22 Z" fill="#E8C030" />
      <path d="M38 22 L38 28 L34 26 L34 20 Z" fill="#B8920A" />
      <path d="M82 22 L82 28 L86 26 L86 20 Z" fill="#B8920A" />
      <path d="M34 20 L60 8 L86 20 L60 10 Z" fill="#F0D060" />

      {/* Top face — light purple */}
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="#C9A0FF" />
      <path d="M38 28 L60 40 L82 28 L60 16 Z" fill="url(#topGambit)" />

      {/* Left face — mid purple */}
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="#A566E8" />
      <path d="M38 28 L60 40 L60 90 L38 78 Z" fill="url(#leftGambit)" />

      {/* Right face — deep purple */}
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="#7B3FCC" />
      <path d="M82 28 L60 40 L60 90 L82 78 Z" fill="url(#rightGambit)" />

      {/* Gold bottom frame */}
      <path d="M38 78 L60 90 L82 78 L82 82 L60 94 L38 82 Z" fill="#D4A017" />
      <path d="M38 78 L38 82 L34 80 L34 76 Z" fill="#A07808" />
      <path d="M82 78 L82 82 L86 80 L86 76 Z" fill="#A07808" />

      {/* Gem highlight — bright */}
      <path d="M55 42 L60 37 L65 42 L60 53 Z" fill="rgba(255,255,255,0.65)" />
      <path d="M60 53 L55 42 L60 60 Z" fill="rgba(220,180,255,0.4)" />
      <path d="M60 53 L65 42 L60 60 Z" fill="rgba(180,100,255,0.3)" />

      {/* Gold rim glow on top edges */}
      <path d="M38 28 L60 16 L82 28" stroke="#F0D060" strokeWidth="1" strokeOpacity="0.6" fill="none" />

      <defs>
        <linearGradient id="topGambit" x1="38" y1="16" x2="82" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftGambit" x1="38" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="rightGambit" x1="82" y1="28" x2="60" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.35" />
        </linearGradient>
      </defs>
    </svg>
  )
}
