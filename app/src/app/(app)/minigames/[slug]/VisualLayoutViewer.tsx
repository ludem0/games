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

  // Parallel switches sit level (not stacked): fixed Y per side.
  const switchY = (sw: TrackSwitch) =>
    sw.y ?? (sw.side === 'south' ? RAVINE_Y - 160 : TRACK_TOP + 95)
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

  // Tracks that participate in an X-crossing switch: their black line starts at
  // the node (the segment above is replaced by the crossing arms).
  const crossingTop = new Map<string, number>()
  for (const sw of layout.switches) {
    if (!sw.crossing) continue
    const sy = switchY(sw)
    for (const tid of sw.swapsTrackIds) crossingTop.set(tid, sy)
  }

  // Floating tracks: line runs from TRACK_TOP down to the arm endpoint of the
  // switch that connects to them (nothing below that point).
  const floatingArmBottom = new Map<string, number>()
  for (const sw of layout.switches) {
    const sy = switchY(sw)
    const armEndY = sw.side === 'south' ? sy - FORK_H : sy + FORK_H
    for (const tid of sw.swapsTrackIds) {
      const track = layout.tracks.find(t => t.id === tid)
      if (track?.isFloating) floatingArmBottom.set(tid, armEndY)
    }
  }

  // Two-segment rendering: if a track is anchor of a fork switch at anchorY,
  // and another switch's arm arrives at this track ABOVE anchorY (armEndY < anchorY),
  // the track splits into top segment (TRACK_TOP→armEndY) and bottom segment
  // (anchorY→TRACK_BOTTOM), with a visible gap between them.
  const trackAnchorY = new Map<string, number>()
  for (const sw of layout.switches) {
    if (sw.crossing || !sw.anchorTrackId) continue
    const sy = switchY(sw)
    const curr = trackAnchorY.get(sw.anchorTrackId)
    if (curr == null || sy > curr) trackAnchorY.set(sw.anchorTrackId, sy)
  }
  const trackTopArmY = new Map<string, number>()
  for (const sw of layout.switches) {
    if (sw.crossing) continue
    const sy = switchY(sw)
    const armEndY = sw.side === 'south' ? sy - FORK_H : sy + FORK_H
    for (const tid of sw.swapsTrackIds) {
      if (tid === sw.anchorTrackId) continue
      const tAnchor = trackAnchorY.get(tid)
      if (tAnchor == null) continue
      if (armEndY < tAnchor) {
        const curr = trackTopArmY.get(tid)
        if (curr == null || armEndY < curr) trackTopArmY.set(tid, armEndY)
      }
    }
  }

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
          const lp = { stroke: col, strokeWidth: 5, strokeLinecap: 'round' as const }

          if (track.isFloating) {
            const armY = floatingArmBottom.get(track.id)
            if (armY == null) return null
            return <line key={track.id} x1={x} y1={TRACK_TOP} x2={x} y2={armY} {...lp} />
          }

          if (crossingTop.has(track.id)) {
            const top = crossingTop.get(track.id)!
            return <line key={track.id} x1={x} y1={top} x2={x} y2={TRACK_BOTTOM} {...lp} />
          }

          const tAnchor = trackAnchorY.get(track.id)
          const topArm = trackTopArmY.get(track.id)
          if (tAnchor != null && topArm != null && topArm < tAnchor) {
            return (
              <g key={track.id}>
                <line x1={x} y1={TRACK_TOP} x2={x} y2={topArm} {...lp} />
                <line x1={x} y1={tAnchor} x2={x} y2={TRACK_BOTTOM} {...lp} />
              </g>
            )
          }

          return <line key={track.id} x1={x} y1={TRACK_TOP} x2={x} y2={TRACK_BOTTOM} {...lp} />
        })}

        {/* Switches: X-cross (node per track, colored arms cross) or fork (single node) */}
        {layout.switches.map((sw) => {
          const sy = switchY(sw)
          const idxs = sw.swapsTrackIds.map(trackIdx).filter(i => i >= 0)

          // Plain connector: horizontal black line at sy, no node/lever. Checked before idxs.length guard.
          if (sw.plain) {
            const ai = anchorIdx(sw)
            if (ai < 0) return null
            const ti0 = trackIdx(sw.swapsTrackIds[0])
            if (ti0 < 0) return null
            return (
              <line key={sw.id} x1={tx(ai)} y1={sy} x2={tx(ti0)} y2={sy}
                stroke="#1a1a1a" strokeWidth={5} strokeLinecap="round" />
            )
          }

          if (idxs.length < 2) return null

          if (sw.crossing) {
            // Each track gets a node; grey vertical arm to its own top box,
            // colored diagonal arm to the partner track top — the two cross.
            const armTopY = TRACK_TOP
            return (
              <g key={sw.id}>
                {idxs.map((ti, k) => {
                  const partner = idxs[(k + 1) % idxs.length]
                  return (
                    <g key={`arm-${k}`}>
                      <line x1={tx(ti)} y1={sy} x2={tx(ti)} y2={armTopY}
                        stroke="#c9c9c9" strokeWidth={6} strokeLinecap="round" />
                      <line x1={tx(ti)} y1={sy} x2={tx(partner)} y2={armTopY}
                        stroke={sw.color} strokeWidth={6} strokeLinecap="round" />
                    </g>
                  )
                })}
                {idxs.map((ti, k) => (
                  <circle key={`node-${k}`} cx={tx(ti)} cy={sy} r={NODE_R}
                    fill={sw.color} stroke="#fff" strokeWidth={2} />
                ))}
              </g>
            )
          }

          // Fork: single node on anchor; active arm = anchor (straight), others grey.
          const ai = anchorIdx(sw)
          if (ai < 0) return null
          const ax = tx(ai)
          const armEndY = sw.side === 'south' ? sy - FORK_H : sy + FORK_H
          const anchorTrack = sw.anchorTrackId
            ? layout.tracks.find(t => t.id === sw.anchorTrackId)
            : null
          const switchActivated = anchorTrack?.isGreyed ?? false
          return (
            <g key={sw.id}>
              {sw.swapsTrackIds.map((tid, k) => {
                const ti = trackIdx(tid)
                if (ti < 0) return null
                // If anchor is not in swapsTrackIds, first swap = standard (active) arm
                const anchorInSwaps = sw.swapsTrackIds.includes(sw.anchorTrackId ?? '')
                const isAnchorArm = anchorInSwaps ? tid === sw.anchorTrackId : k === 0
                const isActive = switchActivated ? !isAnchorArm : isAnchorArm
                const armCol = isActive ? sw.color : '#c9c9c9'
                return (
                  <line key={k} x1={ax} y1={sy} x2={tx(ti)} y2={armEndY}
                    stroke={armCol} strokeWidth={6} strokeLinecap="round" />
                )
              })}
              <circle cx={ax} cy={sy} r={NODE_R}
                fill={sw.color} stroke="#fff" strokeWidth={2} />
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
            if (chain.points === 0) return null
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

        {/* South track letters — floating tracks skipped; letters are sequential over non-floating only */}
        {(() => {
          let li = 0
          return layout.tracks.map((track, i) => {
            if (track.isFloating) return null
            const letter = String.fromCharCode(65 + li++)
            const x = tx(i)
            return (
              <g key={track.id}>
                <rect x={x - 18} y={LETTER_Y} width={36} height={32} rx={6}
                  fill="#ffffff" stroke="#2b3a67" strokeWidth={2.5} />
                <text x={x} y={LETTER_Y + 22} textAnchor="middle"
                  fill="#2b3a67" fontSize={18} fontFamily="Poppins,sans-serif" fontWeight="800">
                  {letter}
                </text>
              </g>
            )
          })
        })()}

        {/* Switch levers: one per (color, side) group — single lever controls all switches of that color */}
        {(() => {
          const groups = new Map<string, { color: string; side: 'north' | 'south'; allIdxs: number[] }>()
          for (const sw of layout.switches) {
            if (sw.noLever) continue
            const key = `${sw.color}|${sw.side}`
            const idxs = sw.swapsTrackIds.map(trackIdx).filter(i => i >= 0)
            if (!groups.has(key)) groups.set(key, { color: sw.color, side: sw.side, allIdxs: [] })
            groups.get(key)!.allIdxs.push(...idxs)
          }
          return Array.from(groups.entries()).map(([key, g]) => {
            if (g.allIdxs.length === 0) return null
            const midIdx = g.allIdxs.reduce((a, b) => a + b, 0) / g.allIdxs.length
            const lx = tx(midIdx)
            const ly = g.side === 'north' ? TOP_BOX_Y - 4 : RAVINE_Y + 10
            return (
              <g key={`lever-${key}`}>
                <rect x={lx - 24} y={ly} width={48} height={26} rx={4}
                  fill="#e8731c" stroke="#bf4c0a" strokeWidth={1.5} />
                <rect x={lx - 18} y={ly + 8} width={11} height={10} rx={2} fill="#cfcfcf" />
                <circle cx={lx + 8} cy={ly + 13} r={7} fill={g.color} />
              </g>
            )
          })
        })()}
      </svg>
    </div>
  )
}
