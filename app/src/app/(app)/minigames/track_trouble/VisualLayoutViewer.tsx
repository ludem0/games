'use client'

import type { RoundLayout } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 800
const H = 650
const RAVINE_Y = 470
const NORTH_Y = 60
const SOUTH_Y = 580
const WAGON_H = 42
const WAGON_W = 54
const FORK_H = 60

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
  const switchY = (si: number) => RAVINE_Y - 160 - si * 70

  const isNorth = playerSide === 'north'
  const isSouth = playerSide === 'south'

  return (
    <div className={styles.svgWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgCanvas} role="img" aria-label="Макет раунда">

        {/* Side highlights */}
        {isNorth && <rect x={0} y={0} width={W} height={RAVINE_Y} fill="rgba(0,252,237,0.03)" />}
        {isSouth && <rect x={0} y={RAVINE_Y} width={W} height={H - RAVINE_Y} fill="rgba(0,252,237,0.03)" />}

        {/* Ravine */}
        <line x1={0} y1={RAVINE_Y} x2={W} y2={RAVINE_Y} stroke="#6b5d2f" strokeWidth={7} strokeLinecap="round" />
        <text x={W / 2} y={RAVINE_Y + 18} textAnchor="middle"
          fill="rgba(255,255,255,0.12)" fontSize={9} fontFamily="Poppins,sans-serif" letterSpacing={4}>
          ПРОПАСТЬ
        </text>

        {/* Side labels */}
        <text x={16} y={NORTH_Y - 8}
          fill={isNorth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={11} fontFamily="Poppins,sans-serif" fontWeight={isNorth ? '700' : '400'}>
          🏔 СЕВЕР{isNorth ? '  ← ВЫ ЗДЕСЬ' : ''}
        </text>
        <text x={16} y={SOUTH_Y + 28}
          fill={isSouth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={11} fontFamily="Poppins,sans-serif" fontWeight={isSouth ? '700' : '400'}>
          ⛏ ЮГ{isSouth ? '  ← ВЫ ЗДЕСЬ' : ''}
        </text>

        {/* Track lines */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          const col = track.isGreyed ? '#3a3a3a' : track.color
          return (
            <g key={track.id} opacity={track.isGreyed ? 0.4 : 1}>
              <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                stroke={col} strokeWidth={4} strokeLinecap="round" />
              <rect x={x - 16} y={SOUTH_Y + 8} width={32} height={24} rx={5}
                fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              <text x={x} y={SOUTH_Y + 25} textAnchor="middle"
                fill="rgba(255,255,255,0.6)" fontSize={13} fontFamily="Poppins,sans-serif" fontWeight="600">
                {String.fromCharCode(65 + i)}
              </text>
              {track.isGreyed && (
                <text x={x} y={RAVINE_Y - 18} textAnchor="middle"
                  fill="#555" fontSize={8} fontFamily="Poppins,sans-serif" letterSpacing={1}>
                  ОТКЛ
                </text>
              )}
            </g>
          )
        })}

        {/* Switches — fork rendering */}
        {layout.switches.map((sw, si) => {
          const i0 = trackIdx(sw.swapsTrackIds[0])
          const i1 = trackIdx(sw.swapsTrackIds[1])
          if (i0 < 0 || i1 < 0) return null
          const x0 = tx(i0)
          const x1 = tx(i1)
          const sy = switchY(si)
          const col = sw.active ? sw.color : '#555'
          const armOpacity = sw.active ? 1 : 0.35
          return (
            <g key={sw.id}>
              {/* Diagonal fork arms forming X */}
              <line x1={x0} y1={sy} x2={x1} y2={sy - FORK_H}
                stroke={col} strokeWidth={2.5} opacity={armOpacity} />
              <line x1={x1} y1={sy} x2={x0} y2={sy - FORK_H}
                stroke={col} strokeWidth={2.5} opacity={armOpacity} />
              {/* Thin horizontal connector */}
              <line x1={x0} y1={sy} x2={x1} y2={sy}
                stroke={col} strokeWidth={1.5} opacity={armOpacity * 0.5} strokeDasharray="4 3" />
              {/* Pivot circles */}
              <circle cx={x0} cy={sy} r={9} fill={sw.active ? sw.color : '#333'}
                stroke={sw.active ? sw.color : '#666'} strokeWidth={2} />
              <circle cx={x1} cy={sy} r={9} fill={sw.active ? sw.color : '#333'}
                stroke={sw.active ? sw.color : '#666'} strokeWidth={2} />
            </g>
          )
        })}

        {/* Wagons */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            const departed = crossingNumber === 2 && availableChains != null && !availableChains.includes(chain.id)
            const wy = RAVINE_Y - (ci + 1) * (WAGON_H + 6) - 4
            const wLeft = x - WAGON_W / 2
            return (
              <g key={chain.id} opacity={track.isGreyed || departed ? 0.25 : 1}>
                <rect x={wLeft} y={wy} width={WAGON_W} height={WAGON_H}
                  rx={6} fill={chain.color || '#555'} stroke="#d97706" strokeWidth={1.5} />
                <rect x={wLeft + 3} y={wy + 3} width={WAGON_W - 6} height={WAGON_H - 6}
                  rx={4} fill="rgba(0,0,0,0.25)" />
                <text x={x} y={wy + 16} textAnchor="middle"
                  fill="rgba(255,255,255,0.9)" fontSize={9} fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.destination?.slice(0, 5) || '—'}
                </text>
                <text x={x - 7} y={wy + 30} textAnchor="middle"
                  fill="#00FCED" fontSize={9} fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.points}pt
                </text>
                <text x={x + 14} y={wy + 30} textAnchor="middle"
                  fill="rgba(255,255,255,0.5)" fontSize={11}>
                  {chain.departsTo === 'north' ? '↑' : '↓'}
                </text>
                {Array.from({ length: Math.min(chain.capacity, 6) }).map((_, di) => (
                  <circle key={di}
                    cx={wLeft + 6 + di * 7} cy={wy + WAGON_H - 5}
                    r={2.5} fill="rgba(255,255,255,0.45)" />
                ))}
                {departed && (
                  <line x1={wLeft + 4} y1={wy + WAGON_H / 2}
                    x2={wLeft + WAGON_W - 4} y2={wy + WAGON_H / 2}
                    stroke="#ff6b9d" strokeWidth={2.5} />
                )}
              </g>
            )
          })
        })}

        {/* North destination boxes */}
        {layout.tracks.map((track, i) => {
          if (track.chains.length === 0) return null
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            const offset = (ci - (track.chains.length - 1) / 2) * 60
            const bx = x + offset - 27
            return (
              <g key={chain.id}>
                <rect x={bx} y={NORTH_Y - 44} width={54} height={38} rx={6}
                  fill="rgba(255,255,255,0.06)"
                  stroke={chain.color || 'rgba(255,255,255,0.15)'} strokeWidth={1.5} />
                <text x={bx + 27} y={NORTH_Y - 26} textAnchor="middle"
                  fill="rgba(255,255,255,0.9)" fontSize={14}
                  fontFamily="Poppins,sans-serif" fontWeight="800">
                  {chain.points}
                </text>
                <text x={bx + 27} y={NORTH_Y - 13} textAnchor="middle"
                  fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="Poppins,sans-serif">
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
