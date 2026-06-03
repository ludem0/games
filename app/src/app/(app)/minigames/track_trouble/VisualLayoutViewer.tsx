'use client'

import type { RoundLayout } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 800
const H = 720
const RAVINE_Y = 520
const NORTH_Y = 60
const SOUTH_Y = 640
const WAGON_H = 50
const WAGON_W = 62
const WAGON_GAP = 8
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
        <text x={W / 2} y={RAVINE_Y + 20} textAnchor="middle"
          fill="rgba(255,255,255,0.12)" fontSize={12} fontFamily="Poppins,sans-serif" letterSpacing={4}>
          ПРОПАСТЬ
        </text>

        {/* Side labels */}
        <text x={16} y={NORTH_Y - 8}
          fill={isNorth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={14} fontFamily="Poppins,sans-serif" fontWeight={isNorth ? '700' : '400'}>
          🏔 СЕВЕР{isNorth ? '  ← ВЫ ЗДЕСЬ' : ''}
        </text>
        <text x={16} y={SOUTH_Y + 30}
          fill={isSouth ? '#00FCED' : 'rgba(255,255,255,0.2)'}
          fontSize={14} fontFamily="Poppins,sans-serif" fontWeight={isSouth ? '700' : '400'}>
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
              <rect x={x - 18} y={SOUTH_Y + 8} width={36} height={28} rx={6}
                fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              <text x={x} y={SOUTH_Y + 28} textAnchor="middle"
                fill="rgba(255,255,255,0.6)" fontSize={17} fontFamily="Poppins,sans-serif" fontWeight="700">
                {String.fromCharCode(65 + i)}
              </text>
              {track.isGreyed && (
                <text x={x} y={RAVINE_Y - 18} textAnchor="middle"
                  fill="#555" fontSize={10} fontFamily="Poppins,sans-serif" letterSpacing={1}>
                  ОТКЛ
                </text>
              )}
            </g>
          )
        })}

        {/* Switches — single node + diagonal fork arm */}
        {layout.switches.map((sw, si) => {
          const i0 = trackIdx(sw.swapsTrackIds[0])
          const i1 = trackIdx(sw.swapsTrackIds[1])
          if (i0 < 0 || i1 < 0) return null
          const x0 = tx(i0)
          const x1 = tx(i1)
          const sy = switchY(si)
          const armEndY = sw.side === 'north' ? sy - FORK_H : sy + FORK_H
          const col = sw.active ? sw.color : '#555'
          const armOpacity = sw.active ? 1 : 0.35
          return (
            <g key={sw.id}>
              {/* Diagonal fork arm: source node → target track */}
              <line x1={x0} y1={sy} x2={x1} y2={armEndY}
                stroke={col} strokeWidth={4} strokeLinecap="round" opacity={armOpacity} />
              {/* Single pivot node on source track */}
              <circle cx={x0} cy={sy} r={11} fill={sw.active ? sw.color : '#333'}
                stroke={sw.active ? sw.color : '#666'} strokeWidth={2} />
              {/* Target letter label at arm end */}
              <text x={x1} y={armEndY + (sw.side === 'north' ? -6 : 16)} textAnchor="middle"
                fill={col} fontSize={13} fontFamily="Poppins,sans-serif" fontWeight="700"
                opacity={armOpacity}>
                →{String.fromCharCode(65 + i1)}
              </text>
            </g>
          )
        })}

        {/* Wagons */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            const departed = crossingNumber === 2 && availableChains != null && !availableChains.includes(chain.id)
            const wy = RAVINE_Y - (ci + 1) * (WAGON_H + WAGON_GAP) - 4
            const wLeft = x - WAGON_W / 2
            return (
              <g key={chain.id} opacity={track.isGreyed || departed ? 0.25 : 1}>
                <rect x={wLeft} y={wy} width={WAGON_W} height={WAGON_H}
                  rx={6} fill={chain.color || '#555'} stroke="#d97706" strokeWidth={2} />
                <rect x={wLeft + 4} y={wy + 4} width={WAGON_W - 8} height={WAGON_H - 8}
                  rx={4} fill="rgba(0,0,0,0.25)" />
                {/* corner bolts */}
                {[[wLeft + 6, wy + 6], [wLeft + WAGON_W - 6, wy + 6],
                  [wLeft + 6, wy + WAGON_H - 6], [wLeft + WAGON_W - 6, wy + WAGON_H - 6]].map(([bx, by], bi) => (
                  <circle key={bi} cx={bx} cy={by} r={2} fill="rgba(0,0,0,0.45)" />
                ))}
                <text x={x} y={wy + 20} textAnchor="middle"
                  fill="rgba(255,255,255,0.95)" fontSize={13} fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.destination?.slice(0, 6) || '—'}
                </text>
                <text x={x - 10} y={wy + 37} textAnchor="middle"
                  fill="#00FCED" fontSize={13} fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.points}pt
                </text>
                <text x={x + 18} y={wy + 38} textAnchor="middle"
                  fill="rgba(255,255,255,0.6)" fontSize={15}>
                  {chain.departsTo === 'north' ? '↑' : '↓'}
                </text>
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
            const offset = (ci - (track.chains.length - 1) / 2) * 70
            const bx = x + offset - 32
            return (
              <g key={chain.id}>
                <rect x={bx} y={NORTH_Y - 52} width={64} height={46} rx={7}
                  fill="rgba(255,255,255,0.06)"
                  stroke={chain.color || 'rgba(255,255,255,0.15)'} strokeWidth={2} />
                <text x={bx + 32} y={NORTH_Y - 30} textAnchor="middle"
                  fill="rgba(255,255,255,0.95)" fontSize={20}
                  fontFamily="Poppins,sans-serif" fontWeight="800">
                  {chain.points}
                </text>
                <text x={bx + 32} y={NORTH_Y - 14} textAnchor="middle"
                  fill="rgba(255,255,255,0.4)" fontSize={12} fontFamily="Poppins,sans-serif">
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
