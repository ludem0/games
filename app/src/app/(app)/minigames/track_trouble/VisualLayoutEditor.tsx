'use client'

import { useState, useRef } from 'react'
import type { RoundLayout, Track, TrackSwitch, MinecartChain } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 800
const H = 650
const RAVINE_Y = 470
const NORTH_Y = 60
const SOUTH_Y = 580
const WAGON_H = 42
const WAGON_W = 54
const FORK_H = 60
const SWITCH_HANDLE_Y = 195

type Selection =
  | { type: 'track'; trackId: string }
  | { type: 'chain'; trackId: string; chainId: string }
  | { type: 'switch'; switchId: string }
  | null

type ChainDrag = { chainId: string; fromTrackId: string; svgX: number; svgY: number } | null
type SwitchDrag = { fromTrackId: string; svgX: number; svgY: number } | null

function newChain(): MinecartChain {
  return {
    id: `c${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    capacity: 2, color: '#8b5cf6', destination: '', points: 0, departsTo: 'north',
  }
}
function newTrack(): Track {
  return { id: `t${Date.now()}`, color: '#8b5cf6', chains: [], isGreyed: false }
}
function newSwitch(id0: string, id1: string): TrackSwitch {
  return { id: `sw${Date.now()}`, color: '#f59e0b', side: 'south', active: true, swapsTrackIds: [id0, id1] }
}

interface Props {
  gameSlug: string
  roundNumber: number
  initialLayout: RoundLayout
  onSaved: (layout: RoundLayout) => void
}

export default function VisualLayoutEditor({ gameSlug, roundNumber, initialLayout, onSaved }: Props) {
  const [layout, setLayout] = useState<RoundLayout>(() => JSON.parse(JSON.stringify(initialLayout)))
  const [sel, setSel] = useState<Selection>(null)
  const [chainDrag, setChainDrag] = useState<ChainDrag>(null)
  const [switchDrag, setSwitchDrag] = useState<SwitchDrag>(null)
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  const n = layout.tracks.length
  const spacing = n > 0 ? W / (n + 1) : W / 2
  const tx = (i: number) => spacing * (i + 1)
  const trackIdx = (id: string) => layout.tracks.findIndex(t => t.id === id)
  const switchY = (si: number) => RAVINE_Y - 160 - si * 70
  const plusY = (chainCount: number) =>
    chainCount === 0 ? RAVINE_Y - 32 : RAVINE_Y - chainCount * (WAGON_H + 6) - 38

  function toSVGCoords(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    }
  }

  function closestTrack(svgX: number, excludeId?: string): string | null {
    let minDist = 70
    let closest: string | null = null
    layout.tracks.forEach((t, i) => {
      if (excludeId && t.id === excludeId) return
      const dist = Math.abs(tx(i) - svgX)
      if (dist < minDist) { minDist = dist; closest = t.id }
    })
    return closest
  }

  // ── Mutations ─────────────────────────────────────────────
  function updTrack(id: string, patch: Partial<Track>) {
    setLayout(l => ({ ...l, tracks: l.tracks.map(t => t.id === id ? { ...t, ...patch } : t) }))
  }
  function updChain(trackId: string, chainId: string, patch: Partial<MinecartChain>) {
    setLayout(l => ({
      ...l,
      tracks: l.tracks.map(t => t.id !== trackId ? t : {
        ...t, chains: t.chains.map(c => c.id === chainId ? { ...c, ...patch } : c),
      }),
    }))
  }
  function updSwitch(id: string, patch: Partial<TrackSwitch>) {
    setLayout(l => ({ ...l, switches: l.switches.map(s => s.id === id ? { ...s, ...patch } : s) }))
  }
  function addTrack() {
    const t = newTrack()
    setLayout(l => ({ ...l, tracks: [...l.tracks, t] }))
    setSel({ type: 'track', trackId: t.id })
  }
  function addChainToTrack(trackId: string) {
    const c = newChain()
    setLayout(l => ({
      ...l,
      tracks: l.tracks.map(t => t.id !== trackId ? t : { ...t, chains: [...t.chains, c] }),
    }))
    setSel({ type: 'chain', trackId, chainId: c.id })
  }
  function deleteSelected() {
    if (!sel) return
    if (sel.type === 'track') {
      setLayout(l => ({
        ...l,
        tracks: l.tracks.filter(t => t.id !== sel.trackId),
        switches: l.switches.filter(s => !s.swapsTrackIds.includes(sel.trackId)),
      }))
    } else if (sel.type === 'chain') {
      setLayout(l => ({
        ...l,
        tracks: l.tracks.map(t => t.id !== sel.trackId ? t : {
          ...t, chains: t.chains.filter(c => c.id !== sel.chainId),
        }),
      }))
    } else if (sel.type === 'switch') {
      setLayout(l => ({ ...l, switches: l.switches.filter(s => s.id !== sel.switchId) }))
    }
    setSel(null)
  }

  // ── SVG mouse handlers ────────────────────────────────────
  function onSVGMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chainDrag && !switchDrag) return
    const { x, y } = toSVGCoords(e)
    if (chainDrag) {
      setChainDrag(d => d ? { ...d, svgX: x, svgY: y } : null)
      setHoveredTrackId(closestTrack(x, chainDrag.fromTrackId))
    }
    if (switchDrag) {
      setSwitchDrag(d => d ? { ...d, svgX: x, svgY: y } : null)
      setHoveredTrackId(closestTrack(x, switchDrag.fromTrackId))
    }
  }

  function onSVGMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    const { x } = toSVGCoords(e)
    if (chainDrag) {
      const target = closestTrack(x, chainDrag.fromTrackId)
      if (target) {
        const srcTrack = layout.tracks.find(t => t.id === chainDrag.fromTrackId)
        const chain = srcTrack?.chains.find(c => c.id === chainDrag.chainId)
        if (chain) {
          setLayout(l => ({
            ...l,
            tracks: l.tracks.map(t => {
              if (t.id === chainDrag.fromTrackId) return { ...t, chains: t.chains.filter(c => c.id !== chainDrag.chainId) }
              if (t.id === target) return { ...t, chains: [...t.chains, chain] }
              return t
            }),
          }))
          setSel({ type: 'chain', trackId: target, chainId: chainDrag.chainId })
        }
      }
      setChainDrag(null)
      setHoveredTrackId(null)
    }
    if (switchDrag) {
      const target = closestTrack(x, switchDrag.fromTrackId)
      if (target) {
        const sw = newSwitch(switchDrag.fromTrackId, target)
        setLayout(l => ({ ...l, switches: [...l.switches, sw] }))
        setSel({ type: 'switch', switchId: sw.id })
      }
      setSwitchDrag(null)
      setHoveredTrackId(null)
    }
  }

  function onSVGMouseLeave() {
    setChainDrag(null)
    setSwitchDrag(null)
    setHoveredTrackId(null)
  }

  function onWagonMouseDown(e: React.MouseEvent, track: Track, chain: MinecartChain) {
    e.stopPropagation()
    e.preventDefault()
    const { x, y } = toSVGCoords(e)
    setChainDrag({ chainId: chain.id, fromTrackId: track.id, svgX: x, svgY: y })
    setSel({ type: 'chain', trackId: track.id, chainId: chain.id })
  }

  function onSwitchHandleMouseDown(e: React.MouseEvent, trackId: string) {
    e.stopPropagation()
    e.preventDefault()
    const { x, y } = toSVGCoords(e)
    setSwitchDrag({ fromTrackId: trackId, svgX: x, svgY: y })
  }

  async function save() {
    setSaving(true)
    setMsg('')
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${roundNumber}/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
    setSaving(false)
    if (res.ok) { setMsg('Сохранено ✓'); onSaved(layout) }
    else setMsg('Ошибка сохранения')
  }

  const isDragging = chainDrag !== null || switchDrag !== null

  const selTrack = sel?.type === 'track' ? layout.tracks.find(t => t.id === sel.trackId) ?? null : null
  const selChain = sel?.type === 'chain'
    ? (layout.tracks.find(t => t.id === sel.trackId)?.chains.find(c => c.id === sel.chainId) ?? null)
    : null
  const selSwitch = sel?.type === 'switch' ? layout.switches.find(s => s.id === sel.switchId) ?? null : null

  return (
    <div className={styles.svgEditorWrap}>
      {/* ── SVG Canvas ── */}
      <div className={styles.svgWrap} style={{ flex: 1, minWidth: 0 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={styles.svgCanvas}
          style={{ cursor: isDragging ? 'grabbing' : 'default' }}
          onMouseMove={onSVGMouseMove}
          onMouseUp={onSVGMouseUp}
          onMouseLeave={onSVGMouseLeave}
          onClick={() => { if (!isDragging) setSel(null) }}
        >
          {/* Ravine */}
          <line x1={0} y1={RAVINE_Y} x2={W} y2={RAVINE_Y} stroke="#6b5d2f" strokeWidth={7} strokeLinecap="round" />
          <text x={W / 2} y={RAVINE_Y + 18} textAnchor="middle"
            fill="rgba(255,255,255,0.12)" fontSize={9} fontFamily="Poppins,sans-serif" letterSpacing={4}
            style={{ pointerEvents: 'none' }}>
            ПРОПАСТЬ
          </text>

          {/* Side labels */}
          <text x={16} y={NORTH_Y - 8} fill="rgba(255,255,255,0.22)"
            fontSize={10} fontFamily="Poppins,sans-serif" style={{ pointerEvents: 'none' }}>
            🏔 СЕВЕР
          </text>
          <text x={16} y={SOUTH_Y + 28} fill="rgba(255,255,255,0.22)"
            fontSize={10} fontFamily="Poppins,sans-serif" style={{ pointerEvents: 'none' }}>
            ⛏ ЮГ
          </text>

          {/* Switch drag preview line */}
          {switchDrag && (() => {
            const idx = trackIdx(switchDrag.fromTrackId)
            if (idx < 0) return null
            return (
              <line x1={tx(idx)} y1={SWITCH_HANDLE_Y} x2={switchDrag.svgX} y2={switchDrag.svgY}
                stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" opacity={0.8}
                style={{ pointerEvents: 'none' }} />
            )
          })()}

          {/* Switches — fork rendering */}
          {layout.switches.map((sw, si) => {
            const i0 = trackIdx(sw.swapsTrackIds[0])
            const i1 = trackIdx(sw.swapsTrackIds[1])
            if (i0 < 0 || i1 < 0) return null
            const x0 = tx(i0)
            const x1 = tx(i1)
            const sy = switchY(si)
            const col = sw.active ? sw.color : '#555'
            const armOp = sw.active ? 1 : 0.35
            const isSel = sel?.type === 'switch' && sel.switchId === sw.id
            return (
              <g key={sw.id} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setSel({ type: 'switch', switchId: sw.id }) }}>
                <line x1={x0} y1={sy} x2={x1} y2={sy - FORK_H}
                  stroke={col} strokeWidth={isSel ? 3 : 2.5} opacity={armOp} />
                <line x1={x1} y1={sy} x2={x0} y2={sy - FORK_H}
                  stroke={col} strokeWidth={isSel ? 3 : 2.5} opacity={armOp} />
                <line x1={x0} y1={sy} x2={x1} y2={sy}
                  stroke={col} strokeWidth={1.5} opacity={armOp * 0.4} strokeDasharray="4 3" />
                <circle cx={x0} cy={sy} r={isSel ? 11 : 9}
                  fill={sw.active ? sw.color : '#333'}
                  stroke={isSel ? '#fff' : (sw.active ? sw.color : '#666')} strokeWidth={isSel ? 2.5 : 2} />
                <circle cx={x1} cy={sy} r={isSel ? 11 : 9}
                  fill={sw.active ? sw.color : '#333'}
                  stroke={isSel ? '#fff' : (sw.active ? sw.color : '#666')} strokeWidth={isSel ? 2.5 : 2} />
              </g>
            )
          })}

          {/* Track lines */}
          {layout.tracks.map((track, i) => {
            const x = tx(i)
            const isGreyed = track.isGreyed
            const col = isGreyed ? '#3a3a3a' : track.color
            const isSel = sel?.type === 'track' && sel.trackId === track.id
            const isHovered = hoveredTrackId === track.id
            return (
              <g key={track.id} opacity={isGreyed ? 0.4 : 1}>
                {/* Hover highlight */}
                {isHovered && (
                  <rect x={x - 28} y={NORTH_Y} width={56} height={SOUTH_Y - NORTH_Y}
                    fill="rgba(139,92,246,0.08)" rx={4} style={{ pointerEvents: 'none' }} />
                )}
                {/* Wide click area */}
                <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                  stroke="transparent" strokeWidth={26}
                  style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setSel({ type: 'track', trackId: track.id }) }} />
                {/* Visible line */}
                <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                  stroke={isSel ? '#ffffff' : col} strokeWidth={isSel ? 5 : 4} strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />

                {/* Letter label */}
                <rect x={x - 16} y={SOUTH_Y + 8} width={32} height={24} rx={5}
                  fill={isSel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}
                  stroke={isSel ? '#8b5cf6' : 'rgba(255,255,255,0.12)'} strokeWidth={1}
                  style={{ pointerEvents: 'none' }} />
                <text x={x} y={SOUTH_Y + 25} textAnchor="middle"
                  fill={isSel ? '#a78bfa' : 'rgba(255,255,255,0.6)'}
                  fontSize={13} fontFamily="Poppins,sans-serif" fontWeight="600"
                  style={{ pointerEvents: 'none' }}>
                  {String.fromCharCode(65 + i)}
                </text>

                {/* Switch drag handle ⚡ */}
                <circle cx={x} cy={SWITCH_HANDLE_Y} r={8}
                  fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.5)" strokeWidth={1.5}
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={e => onSwitchHandleMouseDown(e, track.id)} />
                <text x={x} y={SWITCH_HANDLE_Y + 4} textAnchor="middle"
                  fill="rgba(245,158,11,0.8)" fontSize={9} style={{ pointerEvents: 'none' }}>
                  ⚡
                </text>

                {/* North header boxes per chain */}
                {track.chains.map((chain, ci) => {
                  const offset = (ci - (track.chains.length - 1) / 2) * 60
                  const bx = x + offset - 27
                  return (
                    <g key={chain.id} style={{ pointerEvents: 'none' }}>
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
                })}

                {isGreyed && (
                  <text x={x} y={RAVINE_Y - 18} textAnchor="middle"
                    fill="#555" fontSize={8} fontFamily="Poppins,sans-serif" letterSpacing={1}
                    style={{ pointerEvents: 'none' }}>
                    ОТКЛ
                  </text>
                )}

                {/* "+" button on canvas */}
                <g style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); addChainToTrack(track.id) }}>
                  <circle cx={x} cy={plusY(track.chains.length)} r={12}
                    fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.5)" strokeWidth={1.5} />
                  <text x={x} y={plusY(track.chains.length) + 5} textAnchor="middle"
                    fill="#a78bfa" fontSize={16} fontWeight="700"
                    style={{ pointerEvents: 'none' }}>
                    +
                  </text>
                </g>
              </g>
            )
          })}

          {/* Wagons */}
          {layout.tracks.map((track, i) => {
            const x = tx(i)
            return track.chains.map((chain, ci) => {
              const wy = RAVINE_Y - (ci + 1) * (WAGON_H + 6) - 4
              const wLeft = x - WAGON_W / 2
              const isSel = sel?.type === 'chain' && sel.chainId === chain.id
              const isDraggingThis = chainDrag?.chainId === chain.id
              return (
                <g key={chain.id}
                  opacity={isDraggingThis ? 0.3 : 1}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={e => onWagonMouseDown(e, track, chain)}
                  onClick={e => { e.stopPropagation(); setSel({ type: 'chain', trackId: track.id, chainId: chain.id }) }}>
                  <rect x={wLeft} y={wy} width={WAGON_W} height={WAGON_H}
                    rx={6} fill={chain.color || '#555'}
                    stroke={isSel ? '#ffffff' : '#d97706'} strokeWidth={isSel ? 2.5 : 1.5} />
                  <rect x={wLeft + 3} y={wy + 3} width={WAGON_W - 6} height={WAGON_H - 6}
                    rx={4} fill="rgba(0,0,0,0.25)" style={{ pointerEvents: 'none' }} />
                  <text x={x} y={wy + 16} textAnchor="middle"
                    fill="rgba(255,255,255,0.9)" fontSize={9} fontFamily="Poppins,sans-serif" fontWeight="700"
                    style={{ pointerEvents: 'none' }}>
                    {chain.destination?.slice(0, 5) || '—'}
                  </text>
                  <text x={x - 7} y={wy + 30} textAnchor="middle"
                    fill="#00FCED" fontSize={9} fontFamily="Poppins,sans-serif" fontWeight="700"
                    style={{ pointerEvents: 'none' }}>
                    {chain.points}pt
                  </text>
                  <text x={x + 14} y={wy + 30} textAnchor="middle"
                    fill="rgba(255,255,255,0.5)" fontSize={11} style={{ pointerEvents: 'none' }}>
                    {chain.departsTo === 'north' ? '↑' : '↓'}
                  </text>
                  {Array.from({ length: Math.min(chain.capacity, 6) }).map((_, di) => (
                    <circle key={di}
                      cx={wLeft + 6 + di * 7} cy={wy + WAGON_H - 5}
                      r={2.5} fill="rgba(255,255,255,0.45)" style={{ pointerEvents: 'none' }} />
                  ))}
                </g>
              )
            })
          })}

          {/* Ghost wagon during drag */}
          {chainDrag && (() => {
            const chain = layout.tracks.find(t => t.id === chainDrag.fromTrackId)?.chains.find(c => c.id === chainDrag.chainId)
            if (!chain) return null
            const gx = chainDrag.svgX
            const gy = chainDrag.svgY
            const wLeft = gx - WAGON_W / 2
            return (
              <g opacity={0.75} style={{ pointerEvents: 'none' }}>
                <rect x={wLeft} y={gy - WAGON_H / 2} width={WAGON_W} height={WAGON_H}
                  rx={6} fill={chain.color || '#555'} stroke="#ffffff" strokeWidth={2} />
                <rect x={wLeft + 3} y={gy - WAGON_H / 2 + 3} width={WAGON_W - 6} height={WAGON_H - 6}
                  rx={4} fill="rgba(0,0,0,0.25)" />
                <text x={gx} y={gy - WAGON_H / 2 + 16} textAnchor="middle"
                  fill="rgba(255,255,255,0.9)" fontSize={9} fontFamily="Poppins,sans-serif" fontWeight="700">
                  {chain.destination?.slice(0, 5) || '—'}
                </text>
              </g>
            )
          })()}

          {/* Empty state hint */}
          {layout.tracks.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle"
              fill="rgba(255,255,255,0.15)" fontSize={14} fontFamily="Poppins,sans-serif"
              style={{ pointerEvents: 'none' }}>
              Нажмите «+ Путь» для начала
            </text>
          )}
        </svg>
      </div>

      {/* ── Side Panel ── */}
      <div className={styles.svgSidePanel}>
        {/* Toolbar */}
        <div className={styles.svgToolbar}>
          <button className={styles.editorAddBtn} onClick={addTrack}>+ Путь</button>
        </div>

        <div className={styles.svgHint}>
          {switchDrag
            ? 'Перетащите на другой путь для переключателя'
            : chainDrag
              ? 'Перетащите вагонетку на другой путь'
              : '⚡ потяни к другому пути → переключатель'}
        </div>

        {/* Track properties */}
        {selTrack && (
          <div className={styles.svgPropGroup}>
            <div className={styles.svgPropLabel}>
              Путь {String.fromCharCode(65 + trackIdx(selTrack.id))}
            </div>
            <label className={styles.svgPropRow}>
              <span>Цвет</span>
              <input type="color" className={styles.editorInput}
                value={selTrack.color}
                onChange={e => updTrack(selTrack.id, { color: e.target.value })}
                style={{ width: 48, padding: 2, cursor: 'pointer' }} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Отключён</span>
              <input type="checkbox" checked={selTrack.isGreyed}
                onChange={e => updTrack(selTrack.id, { isGreyed: e.target.checked })} />
            </label>
            <button className={styles.editorRemoveBtn} onClick={deleteSelected}>Удалить путь</button>
          </div>
        )}

        {/* Chain properties */}
        {selChain && sel?.type === 'chain' && (
          <div className={styles.svgPropGroup}>
            <div className={styles.svgPropLabel}>Вагонетка</div>
            <label className={styles.svgPropRow}>
              <span>Назначение</span>
              <input className={styles.editorInput} style={{ width: 110 }}
                value={selChain.destination} placeholder="Название"
                onChange={e => updChain(sel.trackId, selChain.id, { destination: e.target.value })} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Цвет</span>
              <input type="color" className={styles.editorInput}
                value={selChain.color}
                onChange={e => updChain(sel.trackId, selChain.id, { color: e.target.value })}
                style={{ width: 48, padding: 2, cursor: 'pointer' }} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Вместимость</span>
              <input type="number" className={styles.editorInput} style={{ width: 60 }}
                value={selChain.capacity} min={1} max={20}
                onChange={e => updChain(sel.trackId, selChain.id, { capacity: parseInt(e.target.value) || 1 })} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Очки</span>
              <input type="number" className={styles.editorInput} style={{ width: 60 }}
                value={selChain.points} min={0}
                onChange={e => updChain(sel.trackId, selChain.id, { points: parseInt(e.target.value) || 0 })} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Прибывает</span>
              <select className={styles.editorSelect} value={selChain.departsTo}
                onChange={e => updChain(sel.trackId, selChain.id, { departsTo: e.target.value as 'north' | 'south' })}>
                <option value="north">↑ Север</option>
                <option value="south">↓ Юг</option>
              </select>
            </label>
            <button className={styles.editorRemoveBtn} onClick={deleteSelected}>Удалить</button>
          </div>
        )}

        {/* Switch properties */}
        {selSwitch && (
          <div className={styles.svgPropGroup}>
            <div className={styles.svgPropLabel}>Переключатель</div>
            <label className={styles.svgPropRow}>
              <span>Цвет</span>
              <input type="color" className={styles.editorInput}
                value={selSwitch.color}
                onChange={e => updSwitch(selSwitch.id, { color: e.target.value })}
                style={{ width: 48, padding: 2, cursor: 'pointer' }} />
            </label>
            <label className={styles.svgPropRow}>
              <span>Сторона</span>
              <select className={styles.editorSelect} value={selSwitch.side}
                onChange={e => updSwitch(selSwitch.id, { side: e.target.value as 'north' | 'south' })}>
                <option value="south">⛏ Юг</option>
                <option value="north">🏔 Север</option>
              </select>
            </label>
            <label className={styles.svgPropRow}>
              <span>Активен</span>
              <input type="checkbox" checked={selSwitch.active}
                onChange={e => updSwitch(selSwitch.id, { active: e.target.checked })} />
            </label>
            <div className={styles.svgPropNote}>
              {selSwitch.swapsTrackIds.map((id, idx) => {
                const ti = trackIdx(id)
                return `${idx > 0 ? ' ↔ ' : ''}${ti >= 0 ? String.fromCharCode(65 + ti) : '?'}`
              }).join('')}
            </div>
            <button className={styles.editorRemoveBtn} onClick={deleteSelected}>Удалить</button>
          </div>
        )}

        {!sel && !chainDrag && !switchDrag && layout.tracks.length > 0 && (
          <div className={styles.svgHint}>Кликните на элемент для редактирования</div>
        )}

        {/* Peek */}
        <label className={styles.svgPropRow}
          style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Просмотр (2Ψ)</span>
          <input type="checkbox" checked={layout.peekUnlocked}
            onChange={e => setLayout(l => ({ ...l, peekUnlocked: e.target.checked }))} />
        </label>

        {/* Save */}
        <div className={styles.svgSaveRow}>
          <button className={styles.editorSaveBtn} onClick={save} disabled={saving}>
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
          {msg && (
            <span className={`${styles.editorMsg} ${msg.includes('Ошибка') ? styles.editorMsgErr : ''}`}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
