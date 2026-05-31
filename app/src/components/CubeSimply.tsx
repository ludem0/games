export default function CubeSimply() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Horns */}
      <polygon points="44,28 56,21 56,28 44,35" fill="#C8A800" />
      <polygon points="96,28 84,21 84,28 96,35" fill="#987800" />
      <polygon points="44,35 56,28 70,35 56,42" fill="#E8C820" />
      <polygon points="96,35 84,28 70,35 84,42" fill="#B09000" />

      {/* Top face — bright yellow */}
      <polygon points="70,18 96,32 70,46 44,32" fill="#FFE033" />
      <polygon points="70,18 96,32 70,46 44,32" fill="url(#topY)" />

      {/* Left face */}
      <polygon points="44,32 70,46 70,88 44,74" fill="#E8C020" />
      <polygon points="44,32 70,46 70,88 44,74" fill="url(#leftY)" />

      {/* Right face */}
      <polygon points="96,32 70,46 70,88 96,74" fill="#B89010" />
      <polygon points="96,32 70,46 70,88 96,74" fill="url(#rightY)" />

      {/* Bottom cap */}
      <polygon points="44,74 70,88 96,74 96,78 70,92 44,78" fill="#907000" />

      {/* Gem highlight */}
      <polygon points="65,46 70,40 75,46 70,56" fill="rgba(255,255,255,0.7)" />
      <polygon points="70,56 65,46 70,62" fill="rgba(255,230,100,0.4)" />

      <defs>
        <linearGradient id="topY" x1="44" y1="18" x2="96" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.5" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftY" x1="44" y1="32" x2="44" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="rightY" x1="96" y1="32" x2="96" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  )
}
