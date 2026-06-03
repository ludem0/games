'use client'

import type { RoundLayout, TrackSwitch } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 620
const H = 620
const FRAME = 10
const TOP_BOX_Y = 30        // north destination boxes (points)
const TRACK_TOP = 78        // tracks start
const RAVINE_Y = 520        // olive line; wagons sit above
const TRACK_BOTTOM = 560
const LETTER_Y = 588        // south labels
const WAGON_W = 46
const WAGON_H = 34
const WAGON_GAP = 6
const NODE_R = 13
const FORK_H = 70

interface Props {
  layout: RoundLayout
  playerSide: 'north' | 'south'
  availableChains?: string[]
  crossingNumber?: 1 | 2
}

export default function VisualLayoutViewer({ layout, availableChains, crossingNumber }: Props) {
  if (layout.tracks.length === 0) {
    return <div className={styles.layoutEmpty}>Макет не настроен</div>
  }

  const n = layout.tracks.length
  const usableW = W - 2 * FRAME - 40
  const spacing = usableW / (n + 1)
  const tx = (i: number) => FRAME + 20 + spacing * (i + 1)
  const trackIdx = (id: string) => layout.tracks.findIndex(t => t.id === id)

  const switchY = (si: number) => TRACK_TOP + 150 + si * 60
  const anchorIdx = (sw: TrackSwitch) => {
    if (sw.anchorTrackId) {
      const ai = trackIdx(sw.anchorTrackId)
      if (ai >= 0) return ai
    }
    const idxs = sw.swapsTrackIds.map(trackIdx).filter(i => i >= 0)
    if (idxs.length === 0) return -1
    return idxs.reduce((a, b) => a + b, 0) / idxs.length
  }

  const isDeparted = (chainId: string) =>
    crossingNumber === 2 && availableChains != null && !availableChains.includes(chainId)

  return (
    <div className={styles.svgWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.ttCanvas} role="img" aria-label="Макет раунда">
        {/* White board + red frame */}
        <rect x={2} y={2} width={W - 4} height={H - 4} rx={14}
          fill="#fdfdfb" stroke="#c0504d" strokeWidth={9} />

        {/* Ravine */}
        <line x1={FRAME} y1={RAVINE_Y} x2={W - FRAME} y2={RAVINE_Y}
          stroke="#7a6f33" strokeWidth={6} />

        {/* Tracks */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          const col = track.isGreyed ? '#c9c9c9' : '#1a1a1a'
          return (
            <line key={track.id} x1={x} y1={TRACK_TOP} x2={x} y2={TRACK_BOTTOM}
              stroke={col} strokeWidth={5} strokeLinecap="round" />
          )
        })}

        {/* Switches: node + fork arms */}
        {layout.switches.map((sw, si) => {
          const ai = anchorIdx(sw)
          if (ai < 0) return null
          const ax = tx(ai)
          const sy = switchY(si)
          const armEndY = sw.side === 'north' ? sy - FORK_H : sy + FORK_H
          return (
            <g key={sw.id}>
              {sw.swapsTrackIds.map((tid, k) => {
                const ti = trackIdx(tid)
                if (ti < 0) return null
                const t = layout.tracks[ti]
                const aror = Math.round(ti) === Math.round(ai)
                if (aror) return null
                const armCol = t.isGreyed ? '#c9c9c9' : sw.color
                return (
                  <line key={k} x1={ax} y1={sy} x2={tx(ti)} y2={armEndY}
                    stroke={armCol} strokeWidth={6} strokeLinecap="round" />
                )
              })}
              <circle cx={ax} cy={sy} r={NODE_R}
                fill={sw.active ? sw.color : '#8a8a8a'} stroke="#fff" strokeWidth={2} />
            </g>
          )
        })}

        {/* Wagons (grey carts with bolts) */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            if (isDeparted(chain.id)) return null
            return Array.from({ length: chain.capacity }).map((_, wi) => {
              const wy = RAVINE_Y - (ci * 0) - (wi + 1) * (WAGON_H + WAGON_GAP) + WAGON_GAP - 6
              const wLeft = x - WAGON_W / 2
              const grey = track.isGreyed
              return (
                <g key={`${chain.id}-${wi}`} opacity={grey ? 0.4 : 1}>
                  {/* side bolts */}
                  <rect x={wLeft - 5} y={wy + 6} width={6} height={WAGON_H - 12} rx={2} fill="#c2620c" />
                  <rect x={wLeft + WAGON_W - 1} y={wy + 6} width={6} height={WAGON_H - 12} rx={2} fill="#c2620c" />
                  {/* body */}
                  <rect x={wLeft} y={wy} width={WAGON_W} height={WAGON_H} rx={5}
                    fill="#9aa0a6" stroke="#c2620c" strokeWidth={3} />
                  <rect x={wLeft + 5} y={wy + 5} width={WAGON_W - 10} height={WAGON_H - 10} rx={3}
                    fill="#8b9096" />
                </g>
              )
            })
          })
        })}

        {/* North destination boxes (points) */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return track.chains.map((chain, ci) => {
            if (chain.departsTo !== 'north') return null
            const offset = (ci - (track.chains.length - 1) / 2) * 56
            const bx = x + offset - 22
            return (
              <g key={chain.id}>
                <rect x={bx} y={TOP_BOX_Y} width={44} height={40} rx={6}
                  fill="#ffffff" stroke="#2b3a67" strokeWidth={2.5} />
                <text x={bx + 22} y={TOP_BOX_Y + 27} textAnchor="middle"
                  fill="#2b3a67" fontSize={22} fontFamily="Poppins,sans-serif" fontWeight="800">
                  {chain.points}
                </text>
              </g>
            )
          })
        })}

        {/* South track letters */}
        {layout.tracks.map((track, i) => {
          const x = tx(i)
          return (
            <g key={track.id}>
              <rect x={x - 18} y={LETTER_Y} width={36} height={32} rx={6}
                fill="#ffffff" stroke="#2b3a67" strokeWidth={2.5} />
              <text x={x} y={LETTER_Y + 22} textAnchor="middle"
                fill="#2b3a67" fontSize={18} fontFamily="Poppins,sans-serif" fontWeight="800">
                {String.fromCharCode(65 + i)}
              </text>
            </g>
          )
        })}

        {/* Switch levers (orange box + color dot) on the activatable side */}
        {layout.switches.map((sw) => {
          const ai = anchorIdx(sw)
          if (ai < 0) return null
          const lx = tx(Math.round(ai))
          const ly = sw.side === 'north' ? TOP_BOX_Y + 8 : LETTER_Y + 4
          return (
            <g key={`lever-${sw.id}`}>
              <rect x={lx - 24} y={ly} width={48} height={26} rx={4}
                fill="#e8731c" stroke="#16a34a" strokeWidth={2.5} />
              <rect x={lx - 18} y={ly + 8} width={11} height={10} rx={2} fill="#cfcfcf" />
              <circle cx={lx + 8} cy={ly + 13} r={7} fill={sw.color} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
