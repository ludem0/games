'use client'

import type { RoundLayout } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 620
const H = 500
const RAVINE_Y = 300
const NORTH_Y = 55
const SOUTH_Y = 440
const WAGON_H = 28
const WAGON_W = 38

interface Props {
  layout: RoundLayout
  playerSide: 'north' | 'south'
  availableChains?: string[]
  crossingNumber?: 1 | 2
}

export default function VisualLayoutViewer({ layout, playerSide, availableChains, crossingNumber }: Props) {
  if (layout.tracks.length === 0) {
    return <div className={styles.layoutEmpty}>Макет не настроен</div>
  }

  const n = layout.tracks.length
  const spacing = W / (n + 1)
  const tx = (i: number) => spacing * (i + 1)
  const trackIdx = (id: string) => layout.tracks.findIndex(t => t.id === id)
  const switchBaseY = RAVINE_Y - 80
  const switchY = (si: number) => switchBaseY - si * 52

  const isNorth = playerSide === 'north'
  const isSouth = playerSide === 'south'

  return (
    <div className={styles.svgWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgCanvas} role="img" aria-label="Макет раунда">

        {/* Side highlights */}
        {isNorth && <rect x={0} y={0} width={W} height={RAVINE_Y} fill="rgba(0,252,237,0.03)" />}
        {isSouth && <rect x={0} y={RAVINE_Y} width={W} height={H - RAVINE_Y} fill="rgba(0,252,237,0.03)" />}

        {/* Ravine rail */}
        <line x1={0} y1={RAVINE_Y} x2={W} y2={RAVINE_Y} stroke="#6b5d2f" strokeWidth={7} strokeLinecap="round" />
        <text x={W / 2} y={RAVINE_Y + 16} textAnchor="middle"
          fill="rgba(255,255,255,0.15)" fontSize={9} fontFamily="Poppins,sans-serif" letterSpacing={3}>
          ПРОПАСТЬ
        </text>

        {/* Side labels */}
        <text x={14} y={NORTH_Y - 8}
          fill={isNorth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={11} fontFamily="Poppins,sans-serif" fontWeight={isNorth ? '700' : '400'}>
          🏔 СЕВЕР{isNorth ? '  ← ВЫ ЗДЕСЬ' : ''}
        </text>
        <text x={14} y={SOUTH_Y + 32}
          fill={isSouth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={11} fontFamily="Poppins,sans-serif" fontWeight={isSouth ? '700' : '400'}>
          ⛏ ЮГ{isSouth ? '  ← ВЫ ЗДЕСЬ' : ''}
        </text>

        {/* Switches (behind tracks) */}
        {layout.switches.map((sw, si) => {
          const i0 = trackIdx(sw.swapsTrackIds[0])
          const i1 = trackIdx(sw.swapsTrackIds[1])
          if (i0 < 0 || i1 < 0) return null
          const x0 = tx(i0)
          const x1 = tx(i1)
          const sy = switchY(si)
          const col = sw.active ? sw.color : '#555'
          const midX = (x0 + x1) / 2
          return (
            <g key={sw.id}>
              <line x1={x0} y1={sy} x2={x1} y2={sy}
                stroke={col} strokeWidth={sw.active ? 2.5 : 1.5}
                strokeDasharray={sw.active ? '' : '5 3'} opacity={sw.active ? 1 : 0.5} />
              <circle cx={midX} cy={sy} r={9} fill={col} opacity={sw.active ? 1 : 0.5} />
              {!sw.active && (
                <>
                  <line x1={midX - 5} y1={sy - 5} x2={midX + 5} y2={sy + 5} stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
                  <line x1={midX - 5} y1={sy + 5} x2={midX + 5} y2={sy - 5} stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />
                </>
              )}
            </g>
          )
        })}

        {/* Tracks */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          const isGreyed = track.isGreyed
          const lineColor = isGreyed ? '#4a4a4a' : track.color
          return (
            <g key={track.id} opacity={isGreyed ? 0.35 : 1}>
              <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                stroke={lineColor} strokeWidth={3} strokeLinecap="round" />

              {/* Letter label box */}
              <rect x={x - 14} y={SOUTH_Y + 8} width={28} height={22} rx={5}
                fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
              <text x={x} y={SOUTH_Y + 24} textAnchor="middle"
                fill="rgba(255,255,255,0.6)" fontSize={12}
                fontFamily="Poppins,sans-serif" fontWeight="600">
                {String.fromCharCode(65 + i)}
              </text>

              {isGreyed && (
                <text x={x} y={RAVINE_Y - 12} textAnchor="middle"
                  fill="#666" fontSize={8} fontFamily="Poppins,sans-serif" letterSpacing={1}>
                  OFF
                </text>
              )}
            </g>
          )
        })}

        {/* Wagons (chains) — drawn above tracks */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            const departed = crossingNumber === 2 && availableChains != null && !availableChains.includes(chain.id)
            const wy = RAVINE_Y - (ci + 1) * (WAGON_H + 5) - 4
            return (
              <g key={chain.id} opacity={track.isGreyed || departed ? 0.25 : 1}>
                {/* Wagon body */}
                <rect x={x - WAGON_W / 2} y={wy} width={WAGON_W} height={WAGON_H}
                  rx={5} fill={chain.color || '#555'} stroke="#d97706" strokeWidth={1.5} />
                <rect x={x - WAGON_W / 2 + 3} y={wy + 3} width={WAGON_W - 6} height={WAGON_H - 6}
                  rx={3} fill="rgba(0,0,0,0.28)" />
                {/* Seat dots */}
                {Array.from({ length: Math.min(chain.capacity, 5) }).map((_, di) => (
                  <circle key={di}
                    cx={x - WAGON_W / 2 + 6 + di * 6}
                    cy={wy + WAGON_H / 2}
                    r={2.5} fill="rgba(255,255,255,0.5)" />
                ))}
                {/* Departed strikethrough */}
                {departed && (
                  <line
                    x1={x - WAGON_W / 2 + 4} y1={wy + WAGON_H / 2}
                    x2={x + WAGON_W / 2 - 4} y2={wy + WAGON_H / 2}
                    stroke="#ff6b9d" strokeWidth={2} />
                )}
                {/* Destination label */}
                <text x={x} y={wy - 4} textAnchor="middle"
                  fill="rgba(255,255,255,0.45)" fontSize={8} fontFamily="Poppins,sans-serif">
                  {chain.destination?.slice(0, 7) || '—'}
                </text>
              </g>
            )
          })
        })}

        {/* North destination header boxes */}
        {layout.tracks.map((track, i) => {
          if (track.chains.length === 0) return null
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            const offset = (ci - (track.chains.length - 1) / 2) * 46
            const bx = x + offset - 20
            return (
              <g key={chain.id}>
                <rect x={bx} y={NORTH_Y - 40} width={42} height={30} rx={5}
                  fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                <text x={bx + 21} y={NORTH_Y - 24} textAnchor="middle"
                  fill="rgba(255,255,255,0.85)" fontSize={12}
                  fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.points}
                </text>
                <text x={bx + 21} y={NORTH_Y - 13} textAnchor="middle"
                  fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="Poppins,sans-serif">
                  ×{chain.capacity}
                </text>
              </g>
            )
          })
        })}
      </svg>
    </div>
  )
}
