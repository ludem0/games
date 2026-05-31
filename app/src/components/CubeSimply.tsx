export default function CubeSimply() {
  return (
    <svg width="150" height="110" viewBox="0 0 150 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left horn */}
      <polygon points="34,32 28,12 40,12 46,32" fill="#C8A800" />
      <polygon points="28,12 40,12 36,6 32,6" fill="#E8C820" />
      {/* Right horn */}
      <polygon points="116,32 110,12 122,12 128,32" fill="#987800" />
      <polygon points="110,12 122,12 118,6 114,6" fill="#C8A800" />

      {/* Top face — wide flat diamond */}
      <polygon points="75,12 116,32 75,52 34,32" fill="#FFE033" />
      <polygon points="75,12 116,32 75,52 34,32" fill="url(#topY)" />

      {/* Left face */}
      <polygon points="34,32 75,52 75,92 34,72" fill="#D4A800" />
      <polygon points="34,32 75,52 75,92 34,72" fill="url(#leftY)" />

      {/* Right face */}
      <polygon points="116,32 75,52 75,92 116,72" fill="#A07800" />
      <polygon points="116,32 75,52 75,92 116,72" fill="url(#rightY)" />

      {/* Bottom cap */}
      <polygon points="34,72 75,92 116,72 116,76 75,96 34,76" fill="#806000" />

      {/* Gem */}
      <polygon points="70,50 75,43 80,50 75,62" fill="rgba(255,255,255,0.7)" />
      <polygon points="75,62 70,50 75,68" fill="rgba(255,230,80,0.4)" />
      <polygon points="75,62 80,50 75,68" fill="rgba(200,150,0,0.3)" />

      <defs>
        <linearGradient id="topY" x1="34" y1="12" x2="116" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="leftY" x1="34" y1="32" x2="34" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="rightY" x1="116" y1="32" x2="116" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity="0.4" />
        </linearGradient>
      </defs>
    </svg>
  )
}
