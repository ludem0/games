'use client'

import type { RoundLayout, TrackSwitch } from '@/lib/minigames'
import { activeArmIndex } from '@/lib/trackRouting'
import styles from './minigame.module.css'

const W = 620
const H = 620
const FRAME = 10
const TOP_BOX_Y = 30        // north destination boxes (points)
const TRACK_TOP = 78        // tracks start
const RAVINE_Y = 520        // olive line; the bottom wagon straddles it
const WAGON_H = 46
const TRACK_BOTTOM = RAVINE_Y + WAGON_H / 2   // tracks end at the bottom wagon, nothing below
const LETTER_Y = 588        // south labels
const WAGON_W = 52
const WAGON_GAP = 10
const TRACK_W = 7           // black track line
const ARM_W = 8             // switch arms
const NODE_R = 15
const FORK_H = 105
const RAMP_CLEAR = 20       // how far a merge ramp stays above the wagon stacks
const MAX_SLOPE = 1.55      // steepest a merge ramp is drawn before it turns into a drop

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

  // Arms always point up, toward the north destination boxes. `side` only says
  // from which bank a player may pull the lever — it does not change geometry.
  const armY = (sw: TrackSwitch) => sw.armTop ?? switchY(sw) - FORK_H

  // Top of a track's wagon stack — where a fan arm meets it when no mergeY is given.
  const stackTopY = (trackId: string) => {
    const t = layout.tracks.find(x => x.id === trackId)
    const cap = t ? Math.max(0, ...t.chains.map(c => c.capacity)) : 0
    return RAVINE_Y - WAGON_H / 2 - Math.max(0, cap - 1) * (WAGON_H + WAGON_GAP)
  }
  const mergeTargets = (sw: TrackSwitch): string[] =>
    sw.mergeTracks ?? (sw.mergeY != null ? sw.swapsTrackIds : [])
  const mergeEndY = (sw: TrackSwitch, trackId: string) => sw.mergeY ?? stackTopY(trackId)

  // The tracks joining a node hang off a straight ramp per side rather than a fan of
  // separate diagonals: the ramp reaches the outermost track, the rest drop vertically.
  interface Ramp {
    x1: number; y1: number; x2: number; y2: number
    drops: { x: number; yFrom: number; yTo: number }[]
  }
  const mergeRamps = (sw: TrackSwitch): Ramp[] => {
    const nodeIdx = anchorIdx(sw)
    if (nodeIdx < 0) return []
    const nx = tx(nodeIdx)
    const ny = switchY(sw)
    const targets = mergeTargets(sw)
      .map(tid => ({ i: trackIdx(tid), x: tx(trackIdx(tid)), y: mergeEndY(sw, tid) }))
      .filter(t => t.i >= 0)

    // When the ramp lands on the wagon stacks it must clear them, otherwise it grazes
    // the topmost wagons and the drops shrink to nothing.
    const clear = sw.mergeY == null ? RAMP_CLEAR : 0

    const ramps: Ramp[] = []
    for (const dir of [-1, 1] as const) {
      const side = targets.filter(t => (t.x - nx) * dir > 0)
      if (side.length === 0) continue
      const far = side.reduce((a, b) => (Math.abs(b.x - nx) > Math.abs(a.x - nx) ? b : a))
      // the ramp never gets steeper than MAX_SLOPE — past that it stops short and the
      // rest of the way down is covered by the vertical drop
      const wanted = (far.y - clear - ny) / Math.abs(far.x - nx)
      const slope = Math.min(wanted, MAX_SLOPE) * dir
      const endY = ny + (far.x - nx) * slope
      ramps.push({
        x1: nx, y1: ny, x2: far.x, y2: endY,
        drops: side
          .map(t => ({ x: t.x, yFrom: ny + (t.x - nx) * slope, yTo: t.y }))
          .filter(d => d.yTo > d.yFrom),
      })
    }
    // the node's own column just runs straight down
    const own = targets.find(t => t.x === nx)
    if (own) ramps.push({ x1: nx, y1: ny, x2: nx, y2: own.y, drops: [] })
    return ramps
  }

  // Floating tracks: line runs from TRACK_TOP down to the arm endpoint of the
  // switch that connects to them (nothing below that point).
  const floatingArmBottom = new Map<string, number>()
  for (const sw of layout.switches) {
    const armEndY = armY(sw)
    for (const tid of sw.swapsTrackIds) {
      const track = layout.tracks.find(t => t.id === tid)
      if (track?.isFloating) {
        // with several arms the line stops at the highest one — the arms below
        // reach it diagonally, they are not part of the column
        const curr = floatingArmBottom.get(tid)
        if (curr == null || armEndY < curr) floatingArmBottom.set(tid, armEndY)
      }
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
  // Plain connectors also cut the anchor track at their Y (used for no-destination tracks)
  for (const sw of layout.switches) {
    if (!sw.plain || !sw.anchorTrackId) continue
    const sy = switchY(sw)
    const curr = trackAnchorY.get(sw.anchorTrackId)
    if (curr == null || sy < curr) trackAnchorY.set(sw.anchorTrackId, sy)
  }
  const trackTopArmY = new Map<string, number>()
  for (const sw of layout.switches) {
    if (sw.crossing) continue
    const armEndY = armY(sw)
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

  // Merge fan: the node is where its tracks join. Each joined track is cut at the
  // fan endpoint; those that also carry an arm are cut at the arm endpoint on top.
  for (const sw of layout.switches) {
    for (const tid of mergeTargets(sw)) {
      trackAnchorY.set(tid, mergeEndY(sw, tid))
      if (sw.swapsTrackIds.includes(tid)) trackTopArmY.set(tid, armY(sw))
    }
  }

  // An arm reaching a floating column has to land where that column actually ends,
  // so several arms pointing at the same destination meet in one place.
  const armLandingY = (sw: TrackSwitch, trackId: string) => {
    const t = layout.tracks.find(x => x.id === trackId)
    if (t?.isFloating) return floatingArmBottom.get(trackId) ?? armY(sw)
    return armY(sw)
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
          const lp = { stroke: col, strokeWidth: TRACK_W, strokeLinecap: 'round' as const }

          if (track.isSpacer) return null

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
          const noDestination = track.chains.length > 0 && track.chains.every(c => c.points === 0)

          // No-destination track with anchor: bottom segment only (cut at anchor Y)
          if (noDestination && tAnchor != null) {
            return <line key={track.id} x1={x} y1={tAnchor} x2={x} y2={TRACK_BOTTOM} {...lp} />
          }

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
                stroke="#1a1a1a" strokeWidth={TRACK_W} strokeLinecap="round" />
            )
          }

          if (idxs.length < 2) return null

          if (sw.crossing) {
            // Each track gets a node; grey vertical arm to its own top box,
            // colored diagonal arm to the partner track top — the two cross.
            const armTopY = armY(sw)
            return (
              <g key={sw.id}>
                {idxs.map((ti, k) => {
                  const partner = idxs[(k + 1) % idxs.length]
                  return (
                    <g key={`arm-${k}`}>
                      <line x1={tx(ti)} y1={sy} x2={tx(ti)} y2={armTopY}
                        stroke="#c9c9c9" strokeWidth={ARM_W} strokeLinecap="round" />
                      <line x1={tx(ti)} y1={sy} x2={tx(partner)} y2={armTopY}
                        stroke={sw.color} strokeWidth={ARM_W} strokeLinecap="round" />
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
          const armEndY = armY(sw)
          const activeTid = sw.swapsTrackIds[activeArmIndex(sw)]
          return (
            <g key={sw.id}>
              {/* One ramp per side runs from the node down to the outermost track;
                  the tracks in between hang off it on short vertical drops. */}
              {mergeRamps(sw).map((ramp, ri) => (
                <g key={`merge-${ri}`}>
                  <line x1={ramp.x1} y1={ramp.y1} x2={ramp.x2} y2={ramp.y2}
                    stroke="#1a1a1a" strokeWidth={TRACK_W} strokeLinecap="round" />
                  {ramp.drops.map((d, di) => (
                    <line key={di} x1={d.x} y1={d.yFrom} x2={d.x} y2={d.yTo}
                      stroke="#1a1a1a" strokeWidth={TRACK_W} strokeLinecap="round" />
                  ))}
                </g>
              ))}
              {sw.swapsTrackIds.map((tid, k) => {
                const ti = trackIdx(tid)
                if (ti < 0) return null
                const armCol = tid === activeTid ? sw.color : '#c9c9c9'
                return (
                  <line key={k} x1={ax} y1={sy} x2={tx(ti)} y2={armLandingY(sw, tid)}
                    stroke={armCol} strokeWidth={ARM_W} strokeLinecap="round" />
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
              // bottom wagon straddles the ravine line; the stack grows upward
              const wy = RAVINE_Y - WAGON_H / 2 - wi * (WAGON_H + WAGON_GAP)
              const wLeft = x - WAGON_W / 2
              const grey = track.isGreyed
              return (
                <g key={`${chain.id}-${wi}`} opacity={grey ? 0.4 : 1}>
                  {/* two bolts per side, near the corners */}
                  {[wy + 7, wy + WAGON_H - 15].map((by, bi) => (
                    <g key={bi}>
                      <rect x={wLeft - 7} y={by} width={9} height={8} rx={2} fill="#c2620c" />
                      <rect x={wLeft + WAGON_W - 2} y={by} width={9} height={8} rx={2} fill="#c2620c" />
                    </g>
                  ))}
                  {/* body */}
                  <rect x={wLeft} y={wy} width={WAGON_W} height={WAGON_H} rx={7}
                    fill="#9aa0a6" stroke="#c2620c" strokeWidth={4} />
                  <rect x={wLeft + 6} y={wy + 6} width={WAGON_W - 12} height={WAGON_H - 12} rx={4}
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
            if (track.isFloating || track.isSpacer) return null
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
          const groups = new Map<string, { color: string; side: 'north' | 'south'; allIdxs: number[]; leverIdx?: number }>()
          for (const sw of layout.switches) {
            if (sw.noLever) continue
            // 'both' means the lever is reachable from either bank — draw one on each
            const sides: ('north' | 'south')[] = sw.side === 'both' ? ['north', 'south'] : [sw.side]
            for (const side of sides) {
              const key = `${sw.color}|${side}`
              const idxs = sw.swapsTrackIds.map(trackIdx).filter(i => i >= 0)
              if (!groups.has(key)) groups.set(key, { color: sw.color, side, allIdxs: [] })
              const g = groups.get(key)!
              g.allIdxs.push(...idxs)
              const at = (side === 'north' ? sw.leverAtNorth : sw.leverAtSouth) ?? sw.leverAt
              if (at && g.leverIdx == null) {
                const li = trackIdx(at)
                if (li >= 0) g.leverIdx = li
              }
            }
          }
          return Array.from(groups.entries()).map(([key, g]) => {
            if (g.allIdxs.length === 0) return null
            // lever sits in its declared slot (usually an empty column); otherwise centroid
            const midIdx = g.leverIdx ?? g.allIdxs.reduce((a, b) => a + b, 0) / g.allIdxs.length
            const lx = tx(midIdx)
            const ly = g.side === 'north' ? TOP_BOX_Y + 3 : LETTER_Y + 3
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
