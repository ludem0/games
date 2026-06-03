'use client'

import { useState } from 'react'
import type { RoundLayout, Track, TrackSwitch, MinecartChain } from '@/lib/minigames'
import styles from './minigame.module.css'

const W = 620
const H = 500
const RAVINE_Y = 300
const NORTH_Y = 55
const SOUTH_Y = 440
const WAGON_H = 28
const WAGON_W = 38

type Selection =
  | { type: 'track'; trackId: string }
  | { type: 'chain'; trackId: string; chainId: string }
  | { type: 'switch'; switchId: string }
  | null

// null = off, 'picking1' = waiting for first track, string = first track id (waiting for second)
type AddSwitchState = null | 'picking1' | string

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
  const [addSwitch, setAddSwitch] = useState<AddSwitchState>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const n = layout.tracks.length
  const spacing = n > 0 ? W / (n + 1) : W / 2
  const tx = (i: number) => spacing * (i + 1)
  const trackIdx = (id: string) => layout.tracks.findIndex(t => t.id === id)
  const switchY = (si: number) => RAVINE_Y - 80 - si * 52

  // ── Mutations ──────────────────────────────────────────────
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
    setAddSwitch(null)
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

  function handleTrackClick(trackId: string) {
    if (addSwitch === 'picking1') {
      setAddSwitch(trackId)
    } else if (addSwitch !== null) {
      if (addSwitch !== trackId) {
        const sw = newSwitch(addSwitch, trackId)
        setLayout(l => ({ ...l, switches: [...l.switches, sw] }))
        setSel({ type: 'switch', switchId: sw.id })
      }
      setAddSwitch(null)
    } else {
      setSel({ type: 'track', trackId })
    }
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

  // ── Derived selection ──────────────────────────────────────
  const selTrack = sel?.type === 'track'
    ? layout.tracks.find(t => t.id === sel.trackId) ?? null
    : null
  const selChain = sel?.type === 'chain'
    ? (layout.tracks.find(t => t.id === sel.trackId)?.chains.find(c => c.id === sel.chainId) ?? null)
    : null
  const selSwitch = sel?.type === 'switch'
    ? layout.switches.find(s => s.id === sel.switchId) ?? null
    : null

  const addSwitchActive = addSwitch !== null
  const addSwitchHint = addSwitch === 'picking1'
    ? 'Кликните на первый путь...'
    : addSwitch !== null
      ? 'Кликните на второй путь...'
      : null

  return (
    <div className={styles.svgEditorWrap}>
      {/* ── SVG Canvas ── */}
      <div className={styles.svgWrap} style={{ flex: 1, minWidth: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgCanvas}
          onClick={() => { if (!addSwitch) setSel(null) }}>

          {/* Ravine */}
          <line x1={0} y1={RAVINE_Y} x2={W} y2={RAVINE_Y} stroke="#6b5d2f" strokeWidth={7} strokeLinecap="round" />
          <text x={W / 2} y={RAVINE_Y + 16} textAnchor="middle"
            fill="rgba(255,255,255,0.12)" fontSize={9} fontFamily="Poppins,sans-serif" letterSpacing={3}
            style={{ pointerEvents: 'none' }}>
            ПРОПАСТЬ
          </text>

          {/* Side labels */}
          <text x={14} y={NORTH_Y - 8} fill="rgba(255,255,255,0.22)"
            fontSize={10} fontFamily="Poppins,sans-serif" style={{ pointerEvents: 'none' }}>
            🏔 СЕВЕР
          </text>
          <text x={14} y={SOUTH_Y + 30} fill="rgba(255,255,255,0.22)"
            fontSize={10} fontFamily="Poppins,sans-serif" style={{ pointerEvents: 'none' }}>
            ⛏ ЮГ
          </text>

          {/* First-track highlight when adding switch */}
          {typeof addSwitch === 'string' && addSwitch !== 'picking1' && (() => {
            const idx = trackIdx(addSwitch)
            if (idx < 0) return null
            return (
              <line x1={tx(idx)} y1={NORTH_Y} x2={tx(idx)} y2={SOUTH_Y}
                stroke="#f59e0b" strokeWidth={6} strokeDasharray="6 4" opacity={0.7}
                style={{ pointerEvents: 'none' }} />
            )
          })()}

          {/* Switches */}
          {layout.switches.map((sw, si) => {
            const i0 = trackIdx(sw.swapsTrackIds[0])
            const i1 = trackIdx(sw.swapsTrackIds[1])
            if (i0 < 0 || i1 < 0) return null
            const x0 = tx(i0)
            const x1 = tx(i1)
            const sy = switchY(si)
            const col = sw.active ? sw.color : '#555'
            const midX = (x0 + x1) / 2
            const isSel = sel?.type === 'switch' && sel.switchId === sw.id
            return (
              <g key={sw.id} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setSel({ type: 'switch', switchId: sw.id }) }}>
                <line x1={x0} y1={sy} x2={x1} y2={sy}
                  stroke={col} strokeWidth={isSel ? 3 : 2}
                  strokeDasharray={sw.active ? '' : '5 3'} opacity={sw.active ? 1 : 0.5} />
                <circle cx={midX} cy={sy} r={isSel ? 11 : 9}
                  fill={col} stroke={isSel ? '#fff' : 'transparent'} strokeWidth={2}
                  opacity={sw.active ? 1 : 0.55} />
                {!sw.active && (
                  <>
                    <line x1={midX - 5} y1={sy - 5} x2={midX + 5} y2={sy + 5} stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
                    <line x1={midX - 5} y1={sy + 5} x2={midX + 5} y2={sy - 5} stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
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
            const isSel = sel?.type === 'track' && sel.trackId === track.id
            const isFirstForSwitch = addSwitch === track.id
            return (
              <g key={track.id} opacity={isGreyed ? 0.4 : 1}>
                {/* Wide invisible hit area */}
                <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                  stroke="transparent" strokeWidth={24} style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleTrackClick(track.id) }} />
                {/* Visible track line */}
                <line x1={x} y1={NORTH_Y} x2={x} y2={SOUTH_Y}
                  stroke={isSel || isFirstForSwitch ? '#ffffff' : lineColor}
                  strokeWidth={isSel ? 4.5 : 3} strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />

                {/* Letter label */}
                <rect x={x - 14} y={SOUTH_Y + 8} width={28} height={22} rx={5}
                  fill={isSel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}
                  stroke={isSel ? '#8b5cf6' : 'rgba(255,255,255,0.13)'} strokeWidth={1}
                  style={{ pointerEvents: 'none' }} />
                <text x={x} y={SOUTH_Y + 24} textAnchor="middle"
                  fill={isSel ? '#a78bfa' : 'rgba(255,255,255,0.6)'}
                  fontSize={12} fontFamily="Poppins,sans-serif" fontWeight="600"
                  style={{ pointerEvents: 'none' }}>
                  {String.fromCharCode(65 + i)}
                </text>

                {/* North header boxes per chain */}
                {track.chains.map((chain, ci) => {
                  const offset = (ci - (track.chains.length - 1) / 2) * 46
                  const bx = x + offset - 20
                  return (
                    <g key={chain.id} style={{ pointerEvents: 'none' }}>
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
                })}

                {isGreyed && (
                  <text x={x} y={RAVINE_Y - 12} textAnchor="middle"
                    fill="#666" fontSize={8} fontFamily="Poppins,sans-serif" letterSpacing={1}
                    style={{ pointerEvents: 'none' }}>
                    OFF
                  </text>
                )}
              </g>
            )
          })}

          {/* Wagons */}
          {layout.tracks.map((track, i) => {
            const x = tx(i)
            return track.chains.map((chain, ci) => {
              const wy = RAVINE_Y - (ci + 1) * (WAGON_H + 5) - 4
              const isSel = sel?.type === 'chain' && sel.chainId === chain.id
              return (
                <g key={chain.id} style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setSel({ type: 'chain', trackId: track.id, chainId: chain.id }) }}>
                  <rect x={x - WAGON_W / 2} y={wy} width={WAGON_W} height={WAGON_H}
                    rx={5} fill={chain.color || '#555'}
                    stroke={isSel ? '#ffffff' : '#d97706'} strokeWidth={isSel ? 2.5 : 1.5} />
                  <rect x={x - WAGON_W / 2 + 3} y={wy + 3} width={WAGON_W - 6} height={WAGON_H - 6}
                    rx={3} fill="rgba(0,0,0,0.28)" style={{ pointerEvents: 'none' }} />
                  {Array.from({ length: Math.min(chain.capacity, 5) }).map((_, di) => (
                    <circle key={di}
                      cx={x - WAGON_W / 2 + 6 + di * 6} cy={wy + WAGON_H / 2}
                      r={2.5} fill="rgba(255,255,255,0.5)" style={{ pointerEvents: 'none' }} />
                  ))}
                  <text x={x} y={wy - 4} textAnchor="middle"
                    fill="rgba(255,255,255,0.45)" fontSize={8} fontFamily="Poppins,sans-serif"
                    style={{ pointerEvents: 'none' }}>
                    {chain.destination?.slice(0, 7) || '—'}
                  </text>
                </g>
              )
            })
          })}

          {/* Empty hint */}
          {layout.tracks.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle"
              fill="rgba(255,255,255,0.18)" fontSize={13} fontFamily="Poppins,sans-serif"
              style={{ pointerEvents: 'none' }}>
              Нажмите «+ Путь» чтобы начать
            </text>
          )}
        </svg>
      </div>

      {/* ── Side Panel ── */}
      <div className={styles.svgSidePanel}>
        {/* Toolbar */}
        <div className={styles.svgToolbar}>
          <button className={styles.editorAddBtn} onClick={addTrack}>+ Путь</button>
          {sel?.type === 'track' && (
            <button className={styles.editorAddBtn}
              onClick={() => addChainToTrack(sel.trackId)}>
              + Цепь
            </button>
          )}
          <button
            className={`${styles.editorAddBtn} ${addSwitchActive ? styles.editorAddBtnActive : ''}`}
            onClick={() => setAddSwitch(v => v === null ? 'picking1' : null)}>
            {addSwitchActive ? '✕ Отмена' : '⚡ Переключатель'}
          </button>
        </div>

        {addSwitchHint && (
          <div className={styles.svgHint}>{addSwitchHint}</div>
        )}

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
              <span>Отключён (серый)</span>
              <input type="checkbox" checked={selTrack.isGreyed}
                onChange={e => updTrack(selTrack.id, { isGreyed: e.target.checked })} />
            </label>
            <button className={styles.editorRemoveBtn} onClick={deleteSelected}>
              Удалить путь
            </button>
          </div>
        )}

        {/* Chain properties */}
        {selChain && sel?.type === 'chain' && (
          <div className={styles.svgPropGroup}>
            <div className={styles.svgPropLabel}>Вагонетка</div>
            <label className={styles.svgPropRow}>
              <span>Назначение</span>
              <input className={styles.editorInput} style={{ width: 110 }}
                value={selChain.destination}
                placeholder="Название"
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
              <span>Прибывает на</span>
              <select className={styles.editorSelect}
                value={selChain.departsTo}
                onChange={e => updChain(sel.trackId, selChain.id, { departsTo: e.target.value as 'north' | 'south' })}>
                <option value="north">Север</option>
                <option value="south">Юг</option>
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
              <span>Сторона игрока</span>
              <select className={styles.editorSelect}
                value={selSwitch.side}
                onChange={e => updSwitch(selSwitch.id, { side: e.target.value as 'north' | 'south' })}>
                <option value="south">Юг</option>
                <option value="north">Север</option>
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
                return `${idx > 0 ? ' ↔ ' : ''}Путь ${ti >= 0 ? String.fromCharCode(65 + ti) : '?'}`
              }).join('')}
            </div>
            <button className={styles.editorRemoveBtn} onClick={deleteSelected}>Удалить</button>
          </div>
        )}

        {!sel && !addSwitchHint && layout.tracks.length > 0 && (
          <div className={styles.svgHint}>Кликните на элемент для редактирования</div>
        )}

        {/* Peek toggle */}
        <label className={styles.svgPropRow} style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Просмотр (2Ψ)</span>
          <input type="checkbox" checked={layout.peekUnlocked}
            onChange={e => setLayout(l => ({ ...l, peekUnlocked: e.target.checked }))} />
        </label>

        {/* Save */}
        <div className={styles.svgSaveRow}>
          <button className={styles.editorSaveBtn} onClick={save} disabled={saving}>
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
          {msg && <span className={`${styles.editorMsg} ${msg.includes('Ошибка') ? styles.editorMsgErr : ''}`}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}
