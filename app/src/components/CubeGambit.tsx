export default function CubeGambit() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Gold horns */}
      <polygon points="44,28 56,21 56,28 44,35" fill="#E8C030" />
      <polygon points="96,28 84,21 84,28 96,35" fill="#B89010" />
      <polygon points="44,35 56,28 70,35 56,42" fill="#F0D060" />
      <polygon points="96,35 84,28 70,35 84,42" fill="#C8A020" />

      {/* Top face — light purple */}
      <polygon points="70,18 96,32 70,46 44,32" fill="#C8A0FF" />
      <polygon points="70,18 96,32 70,46 44,32" fill="url(#topG)" />

      {/* Left face */}
      <polygon points="44,32 70,46 70,88 44,74" fill="#9A60E8" />
      <polygon points="44,32 70,46 70,88 44,74" fill="url(#leftG)" />

      {/* Right face */}
      <polygon points="96,32 70,46 70,88 96,74" fill="#6830B8" />
      <polygon points="96,32 70,46 70,88 96,74" fill="url(#rightG)" />

      {/* Gold bottom cap */}
      <polygon points="44,74 70,88 96,74 96,78 70,92 44,78" fill="#C89010" />

      {/* Gold edge line on top */}
      <polyline points="44,32 70,18 96,32" stroke="#F0D060" strokeWidth="1.2" strokeOpacity="0.7" fill="none" />

      {/* Gem */}
      <polygon points="65,46 70,39 75,46 70,57" fill="rgba(255,255,255,0.65)" />
      <polygon points="70,57 65,46 70,64" fill="rgba(210,160,255,0.45)" />
      <polygon points="70,57 75,46 70,64" fill="rgba(160,80,255,0.35)" />

      <defs>
        <linearGradient id="topG" x1="44" y1="18" x2="96" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftG" x1="44" y1="32" x2="44" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="rightG" x1="96" y1="32" x2="96" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </svg>
  )
}
