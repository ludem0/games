'use client'

import { useState } from 'react'
import type { RoundLayout, Track, TrackSwitch, MinecartChain } from '@/lib/minigames'
import styles from './minigame.module.css'

interface Props {
  gameSlug: string
  roundNumber: number
  initialLayout: RoundLayout
  onSaved: (layout: RoundLayout) => void
}

function newChain(): MinecartChain {
  return { id: `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, capacity: 2, color: '#ffffff', destination: '', points: 0, departsTo: 'north' }
}
function newTrack(): Track {
  return { id: `t${Date.now()}`, color: '#8b5cf6', chains: [newChain()], isGreyed: false }
}
function newSwitch(side: 'north' | 'south'): TrackSwitch {
  return { id: `sw${Date.now()}`, color: '#f59e0b', side, active: true, swapsTrackIds: ['', ''] }
}

export default function AdminLayoutEditor({ gameSlug, roundNumber, initialLayout, onSaved }: Props) {
  const [layout, setLayout] = useState<RoundLayout>(JSON.parse(JSON.stringify(initialLayout)))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${roundNumber}/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
    setSaving(false)
    if (res.ok) {
      setMsg('Сохранено')
      onSaved(layout)
    } else {
      setMsg('Ошибка сохранения')
    }
  }

  function updateTrack(ti: number, update: Partial<Track>) {
    setLayout(l => {
      const tracks = [...l.tracks]
      tracks[ti] = { ...tracks[ti], ...update }
      return { ...l, tracks }
    })
  }
  function updateChain(ti: number, ci: number, update: Partial<MinecartChain>) {
    setLayout(l => {
      const tracks = [...l.tracks]
      const chains = [...tracks[ti].chains]
      chains[ci] = { ...chains[ci], ...update }
      tracks[ti] = { ...tracks[ti], chains }
      return { ...l, tracks }
    })
  }
  function updateSwitch(si: number, update: Partial<TrackSwitch>) {
    setLayout(l => {
      const switches = [...l.switches]
      switches[si] = { ...switches[si], ...update }
      return { ...l, switches }
    })
  }

  return (
    <div className={styles.editorWrap}>
      <div className={styles.editorSection}>
        <div className={styles.editorSectionHead}>
          <span>Пути ({layout.tracks.length})</span>
          <button className={styles.editorAddBtn} onClick={() => setLayout(l => ({ ...l, tracks: [...l.tracks, newTrack()] }))}>+ Добавить путь</button>
        </div>
        {layout.tracks.map((track, ti) => (
          <div key={track.id} className={styles.editorTrack}>
            <div className={styles.editorRow}>
              <label>Цвет пути</label>
              <input type="color" value={track.color} onChange={e => updateTrack(ti, { color: e.target.value })} />
              <label>Отключён</label>
              <input type="checkbox" checked={track.isGreyed} onChange={e => updateTrack(ti, { isGreyed: e.target.checked })} />
              <button className={styles.editorRemoveBtn} onClick={() => setLayout(l => ({ ...l, tracks: l.tracks.filter((_, i) => i !== ti) }))}>✕</button>
            </div>
            <div className={styles.editorChainsHead}>
              <span>Вагонетки</span>
              <button className={styles.editorAddBtn} onClick={() => updateTrack(ti, { chains: [...track.chains, newChain()] })}>+ Вагонетка</button>
            </div>
            {track.chains.map((chain, ci) => (
              <div key={chain.id} className={styles.editorChain}>
                <input className={styles.editorInput} placeholder="Назначение" value={chain.destination} onChange={e => updateChain(ti, ci, { destination: e.target.value })} />
                <input className={styles.editorInput} type="color" value={chain.color} onChange={e => updateChain(ti, ci, { color: e.target.value })} style={{ width: 48 }} />
                <label>Вместимость</label>
                <input className={styles.editorInput} type="number" min={1} max={20} value={chain.capacity} onChange={e => updateChain(ti, ci, { capacity: parseInt(e.target.value) || 1 })} style={{ width: 60 }} />
                <label>Очки</label>
                <input className={styles.editorInput} type="number" min={0} value={chain.points} onChange={e => updateChain(ti, ci, { points: parseInt(e.target.value) || 0 })} style={{ width: 60 }} />
                <label>Прибывает на</label>
                <select className={styles.editorSelect} value={chain.departsTo} onChange={e => updateChain(ti, ci, { departsTo: e.target.value as 'north' | 'south' })}>
                  <option value="north">Север</option>
                  <option value="south">Юг</option>
                </select>
                <button className={styles.editorRemoveBtn} onClick={() => updateTrack(ti, { chains: track.chains.filter((_, i) => i !== ci) })}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.editorSection}>
        <div className={styles.editorSectionHead}>
          <span>Переключатели ({layout.switches.length})</span>
          <button className={styles.editorAddBtn} onClick={() => setLayout(l => ({ ...l, switches: [...l.switches, newSwitch('south')] }))}>+ Добавить</button>
        </div>
        {layout.switches.map((sw, si) => (
          <div key={sw.id} className={styles.editorSwitch}>
            <input type="color" value={sw.color} onChange={e => updateSwitch(si, { color: e.target.value })} />
            <select className={styles.editorSelect} value={sw.side} onChange={e => updateSwitch(si, { side: e.target.value as 'north' | 'south' })}>
              <option value="south">Юг</option>
              <option value="north">Север</option>
            </select>
            <label>Активен</label>
            <input type="checkbox" checked={sw.active} onChange={e => updateSwitch(si, { active: e.target.checked })} />
            <label>Меняет пути</label>
            <select className={styles.editorSelect} value={sw.swapsTrackIds[0]} onChange={e => updateSwitch(si, { swapsTrackIds: [e.target.value, sw.swapsTrackIds[1]] })}>
              <option value="">—</option>
              {layout.tracks.map(t => <option key={t.id} value={t.id}>{t.color} ({t.id.slice(-4)})</option>)}
            </select>
            <select className={styles.editorSelect} value={sw.swapsTrackIds[1]} onChange={e => updateSwitch(si, { swapsTrackIds: [sw.swapsTrackIds[0], e.target.value] })}>
              <option value="">—</option>
              {layout.tracks.map(t => <option key={t.id} value={t.id}>{t.color} ({t.id.slice(-4)})</option>)}
            </select>
            <button className={styles.editorRemoveBtn} onClick={() => setLayout(l => ({ ...l, switches: l.switches.filter((_, i) => i !== si) }))}>✕</button>
          </div>
        ))}
      </div>

      <div className={styles.editorRow}>
        <label>Просмотр (2 Ψ) доступен</label>
        <input type="checkbox" checked={layout.peekUnlocked} onChange={e => setLayout(l => ({ ...l, peekUnlocked: e.target.checked }))} />
      </div>

      <div className={styles.editorActions}>
        <button className={styles.editorSaveBtn} onClick={save} disabled={saving}>
          {saving ? 'Сохраняю...' : 'Сохранить макет'}
        </button>
        {msg && <span className={styles.editorMsg}>{msg}</span>}
      </div>
    </div>
  )
}
