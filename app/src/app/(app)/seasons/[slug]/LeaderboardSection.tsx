'use client'

import { useState, useRef } from 'react'
import styles from './season.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  initialRanks: string[]
  participants: string[]
}

const RANK_STYLES = [
  { label: '1', color: '#FFD700', glow: 'rgba(255,215,0,0.25)', border: 'rgba(255,215,0,0.5)' },
  { label: '2', color: '#C0C0C0', glow: 'rgba(192,192,192,0.2)', border: 'rgba(192,192,192,0.4)' },
  { label: '3', color: '#CD7F32', glow: 'rgba(205,127,50,0.2)', border: 'rgba(205,127,50,0.4)' },
]

export default function LeaderboardSection({ slug, accent, isAdmin, initialRanks, participants }: Props) {
  const [ranks, setRanks] = useState<string[]>(initialRanks)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)

  const unranked = participants.filter(p => !ranks.includes(p))

  function addToRanks(username: string) {
    setRanks(prev => [...prev, username])
  }

  function removeFromRanks(username: string) {
    setRanks(prev => prev.filter(u => u !== username))
  }

  function onDragStart(idx: number) { dragIdx.current = idx }

  function onDragEnter(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return
    setRanks(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx.current!, 1)
      next.splice(idx, 0, moved)
      dragIdx.current = idx
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/seasons/${slug}/leaderboard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranks }),
    })
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setRanks(initialRanks)
    setEditing(false)
  }

  const initials = (name: string) => name.slice(0, 2).toUpperCase()

  return (
    <section className={styles.lbSection}>
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
            <button className={styles.cancelBtn2} onClick={handleCancel}>Отмена</button>
          </div>
        )}
      </div>

      {ranks.length === 0 && !editing && (
        <p className={styles.noParticipants}>Места не расставлены</p>
      )}

      {ranks.length > 0 && (
        <div className={styles.rankList}>
          {ranks.map((username, idx) => {
            const rs = RANK_STYLES[idx]
            return (
              <div
                key={username}
                className={`${styles.rankRow} ${editing ? styles.rankRowDrag : ''}`}
                draggable={editing}
                onDragStart={() => onDragStart(idx)}
                onDragEnter={() => onDragEnter(idx)}
                onDragOver={e => e.preventDefault()}
                style={rs ? { boxShadow: `0 0 20px ${rs.glow}, inset 0 0 0 1px ${rs.border}` } : {}}
              >
                <span className={styles.rankNum} style={{ color: rs?.color ?? 'var(--muted)' }}>
                  {idx + 1}
                </span>
                <span className={styles.rankAvatar} style={{ background: `${accent}22`, color: accent, borderColor: `${accent}55` }}>
                  {initials(username)}
                </span>
                <span className={styles.rankName}>{username}</span>
                {editing && (
                  <button className={styles.rankRemoveBtn} onClick={() => removeFromRanks(username)}>
                    ✕
                  </button>
                )}
                {editing && <span className={styles.dragHandle}>⠿</span>}
              </div>
            )
          })}
        </div>
      )}

      {editing && unranked.length > 0 && (
        <div className={styles.unrankedSection}>
          <span className={styles.unrankedLabel}>Не в списке</span>
          <div className={styles.unrankedList}>
            {unranked.map(username => (
              <button key={username} className={styles.unrankedChip} onClick={() => addToRanks(username)}>
                <span className={styles.chipAvatar} style={{ background: `${accent}22`, color: accent }}>
                  {initials(username)}
                </span>
                {username}
                <span className={styles.chipPlus}>+</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
