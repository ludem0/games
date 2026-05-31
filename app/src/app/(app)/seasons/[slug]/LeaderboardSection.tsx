'use client'

import { useState, useRef } from 'react'
import type { Leaderboard, LeaderboardRow } from '@/lib/seasons'
import styles from './season.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  initialLeaderboard: Leaderboard
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardSection({ slug, accent, isAdmin, initialLeaderboard }: Props) {
  const [lb, setLb] = useState<Leaderboard>(initialLeaderboard)
  const [editing, setEditing] = useState(false)
  const [newCol, setNewCol] = useState('')
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)

  function updateValue(rowIdx: number, colIdx: number, val: string) {
    setLb(prev => {
      const rows = prev.rows.map((r, ri) =>
        ri === rowIdx
          ? { ...r, values: r.values.map((v, ci) => ci === colIdx ? (parseInt(val) || 0) : v) }
          : r
      )
      return { ...prev, rows }
    })
  }

  function addColumn() {
    const name = newCol.trim()
    if (!name) return
    setLb(prev => ({
      columns: [...prev.columns, name],
      rows: prev.rows.map(r => ({ ...r, values: [...r.values, 0] })),
    }))
    setNewCol('')
  }

  function removeColumn(colIdx: number) {
    setLb(prev => ({
      columns: prev.columns.filter((_, i) => i !== colIdx),
      rows: prev.rows.map(r => ({ ...r, values: r.values.filter((_, i) => i !== colIdx) })),
    }))
  }

  function onDragStart(idx: number) { dragIdx.current = idx }

  function onDragEnter(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return
    setLb(prev => {
      const rows = [...prev.rows]
      const [moved] = rows.splice(dragIdx.current!, 1)
      rows.splice(idx, 0, moved)
      dragIdx.current = idx
      return { ...prev, rows }
    })
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/seasons/${slug}/leaderboard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lb),
    })
    setSaving(false)
    setEditing(false)
  }

  const isEmpty = lb.columns.length === 0

  return (
    <section className={styles.participantsSection} style={{ marginTop: 16 }}>
      <div className={styles.participantsHeader}>
        <span className={styles.participantsLabel}>ЛИДЕРБОРД</span>
        {isAdmin && !editing && (
          <button className={styles.addBtn} onClick={() => setEditing(true)}>
            Редактировать
          </button>
        )}
        {isAdmin && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.saveBtn2} onClick={handleSave} disabled={saving}>
              {saving ? '...' : 'Сохранить'}
            </button>
            <button className={styles.cancelBtn2} onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className={styles.addColRow}>
          <input
            className={styles.inputSm2}
            placeholder="Название колонки"
            value={newCol}
            onChange={e => setNewCol(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addColumn()}
          />
          <button className={styles.addBtn} onClick={addColumn}>+ Колонка</button>
        </div>
      )}

      {isEmpty && !editing ? (
        <p className={styles.noParticipants}>Лидерборд не настроен</p>
      ) : lb.rows.length === 0 ? (
        <p className={styles.noParticipants}>Нет участников</p>
      ) : (
        <div className={styles.lbWrap}>
          <table className={styles.lbTable}>
            <thead>
              <tr>
                <th className={styles.lbTh}>#</th>
                <th className={styles.lbTh}>Игрок</th>
                {lb.columns.map((col, ci) => (
                  <th key={ci} className={styles.lbTh}>
                    {editing ? (
                      <span className={styles.colHead}>
                        {col}
                        <button className={styles.removeColBtn} onClick={() => removeColumn(ci)}>×</button>
                      </span>
                    ) : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lb.rows.map((row, ri) => (
                <tr
                  key={row.username}
                  className={`${styles.lbRow} ${editing ? styles.lbRowDraggable : ''}`}
                  draggable={editing}
                  onDragStart={() => onDragStart(ri)}
                  onDragEnter={() => onDragEnter(ri)}
                  onDragOver={e => e.preventDefault()}
                >
                  <td className={styles.lbTd}>
                    <span className={styles.medal}>{MEDALS[ri] ?? ri + 1}</span>
                  </td>
                  <td className={`${styles.lbTd} ${styles.lbName}`}>
                    <span className={styles.lbAvatar} style={{ background: `${accent}22`, color: accent, borderColor: `${accent}55` }}>
                      {row.username.slice(0, 2).toUpperCase()}
                    </span>
                    {row.username}
                  </td>
                  {row.values.map((val, ci) => (
                    <td key={ci} className={styles.lbTd}>
                      {editing ? (
                        <input
                          className={styles.lbInput}
                          type="number"
                          value={val}
                          onChange={e => updateValue(ri, ci, e.target.value)}
                        />
                      ) : (
                        <span className={ri === 0 ? styles.topVal : ''}>{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
