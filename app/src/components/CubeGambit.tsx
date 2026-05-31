export default function CubeGambit() {
  return (
    <svg width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left horn — gold */}
      <polygon points="34,32 28,12 40,12 46,32" fill="#E8C030" />
      <polygon points="28,12 40,12 36,6 32,6" fill="#F0D860" />
      {/* Right horn — gold */}
      <polygon points="116,32 110,12 122,12 128,32" fill="#B89010" />
      <polygon points="110,12 122,12 118,6 114,6" fill="#D4A820" />

      {/* Top face — light purple */}
      <polygon points="75,12 116,32 75,52 34,32" fill="#C8A0FF" />
      <polygon points="75,12 116,32 75,52 34,32" fill="url(#topG)" />

      {/* Gold rim */}
      <polyline points="34,32 75,12 116,32" stroke="#F0D060" strokeWidth="1.5" strokeOpacity="0.8" fill="none" />

      {/* Left face */}
      <polygon points="34,32 75,52 75,92 34,72" fill="#9A58E0" />
      <polygon points="34,32 75,52 75,92 34,72" fill="url(#leftG)" />

      {/* Right face */}
      <polygon points="116,32 75,52 75,92 116,72" fill="#6020A8" />
      <polygon points="116,32 75,52 75,92 116,72" fill="url(#rightG)" />

      {/* Gold bottom cap */}
      <polygon points="34,72 75,92 116,72 116,76 75,96 34,76" fill="#C89010" />

      {/* Gem */}
      <polygon points="70,50 75,42 80,50 75,63" fill="rgba(255,255,255,0.68)" />
      <polygon points="75,63 70,50 75,70" fill="rgba(210,160,255,0.5)" />
      <polygon points="75,63 80,50 75,70" fill="rgba(140,60,220,0.4)" />

      <defs>
        <linearGradient id="topG" x1="34" y1="12" x2="116" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.5" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftG" x1="34" y1="32" x2="34" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="rightG" x1="116" y1="32" x2="116" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </svg>
  )
}
