export default function CubeZero() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Horns */}
      <polygon points="44,28 56,21 56,28 44,35" fill="#555" />
      <polygon points="96,28 84,21 84,28 96,35" fill="#333" />
      <polygon points="44,35 56,28 70,35 56,42" fill="#666" />
      <polygon points="96,35 84,28 70,35 84,42" fill="#444" />

      {/* Top face */}
      <polygon points="70,18 96,32 70,46 44,32" fill="#E0E0E0" />
      <polygon points="70,18 96,32 70,46 44,32" fill="url(#topZ)" />

      {/* Left face */}
      <polygon points="44,32 70,46 70,88 44,74" fill="#B0B0B0" />
      <polygon points="44,32 70,46 70,88 44,74" fill="url(#leftZ)" />

      {/* Right face */}
      <polygon points="96,32 70,46 70,88 96,74" fill="#787878" />
      <polygon points="96,32 70,46 70,88 96,74" fill="url(#rightZ)" />

      {/* Bottom cap */}
      <polygon points="44,74 70,88 96,74 96,78 70,92 44,78" fill="#3A3A3A" />

      {/* Gem */}
      <polygon points="65,46 70,40 75,46 70,56" fill="rgba(255,255,255,0.75)" />
      <polygon points="70,56 65,46 70,62" fill="rgba(255,255,255,0.3)" />

      <defs>
        <linearGradient id="topZ" x1="44" y1="18" x2="96" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftZ" x1="44" y1="32" x2="44" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="rightZ" x1="96" y1="32" x2="96" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.35" />
        </linearGradient>
      </defs>
    </svg>
  )
}
