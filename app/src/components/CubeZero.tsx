export default function CubeZero() {
  return (
    <svg width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left horn */}
      <polygon points="34,32 28,12 40,12 46,32" fill="#555" />
      <polygon points="28,12 40,12 36,6 32,6" fill="#666" />
      {/* Right horn */}
      <polygon points="116,32 110,12 122,12 128,32" fill="#333" />
      <polygon points="110,12 122,12 118,6 114,6" fill="#444" />

      {/* Top face */}
      <polygon points="75,12 116,32 75,52 34,32" fill="#E0E0E0" />
      <polygon points="75,12 116,32 75,52 34,32" fill="url(#topZ)" />

      {/* Left face */}
      <polygon points="34,32 75,52 75,92 34,72" fill="#B0B0B0" />
      <polygon points="34,32 75,52 75,92 34,72" fill="url(#leftZ)" />

      {/* Right face */}
      <polygon points="116,32 75,52 75,92 116,72" fill="#707070" />
      <polygon points="116,32 75,52 75,92 116,72" fill="url(#rightZ)" />

      {/* Bottom cap */}
      <polygon points="34,72 75,92 116,72 116,76 75,96 34,76" fill="#303030" />

      {/* Gem */}
      <polygon points="70,50 75,43 80,50 75,62" fill="rgba(255,255,255,0.8)" />
      <polygon points="75,62 70,50 75,68" fill="rgba(200,200,200,0.4)" />
      <polygon points="75,62 80,50 75,68" fill="rgba(100,100,100,0.3)" />

      <defs>
        <linearGradient id="topZ" x1="34" y1="12" x2="116" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.6" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftZ" x1="34" y1="32" x2="34" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.08" />
          <stop offset="100%" stopColor="black" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="rightZ" x1="116" y1="32" x2="116" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </svg>
  )
}
