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

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']

export default function LeaderboardSection({ slug, accent, isAdmin, initialRanks, participants }: Props) {
  const [ranks, setRanks] = useState<string[]>(initialRanks)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)

  const unranked = participants.filter(p => !ranks.includes(p))
  const initials = (n: string) => n.slice(0, 2).toUpperCase()

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

  const rankRowClass = (i: number) =>
    `${styles.rankRow} ${i === 0 ? styles.rankRow1 : i === 1 ? styles.rankRow2 : i === 2 ? styles.rankRow3 : ''} ${editing ? styles.rankRowDrag : ''}`

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ЛИДЕРБОРД</span>
        {isAdmin && !editing && (
          <button className={styles.btnOutline} onClick={() => setEditing(true)}>Редактировать</button>
        )}
        {isAdmin && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnAccent} onClick={handleSave} disabled={saving}>
              {saving ? '...' : 'Сохранить'}
            </button>
            <button className={styles.btnOutline} onClick={handleCancel}>Отмена</button>
          </div>
        )}
      </div>

      {ranks.length === 0 && !editing && (
        <p className={styles.noContent}>Места не расставлены</p>
      )}

      {ranks.length > 0 && (
        <div className={styles.rankList}>
          {ranks.map((username, i) => {
            const color = RANK_COLORS[i] ?? accent
            return (
              <div
                key={username}
                className={rankRowClass(i)}
                draggable={editing}
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={e => e.preventDefault()}
              >
                <span className={`${styles.rankNum} ${i === 0 ? styles.rankNum1 : ''}`} style={{ color }}>
                  {i + 1}
                </span>
                <span
                  className={`${styles.rankAvatar} ${i === 0 ? styles.rankAvatar1 : ''}`}
                  style={{ background: `${color}18`, color, borderColor: `${color}45` }}
                >
                  {initials(username)}
                </span>
                <span className={`${styles.rankName} ${i === 0 ? styles.rankName1 : ''}`}>
                  {username}
                </span>
                {editing && (
                  <>
                    <button className={styles.rankRemoveBtn} onClick={() => removeFromRanks(username)}>✕</button>
                    <span className={styles.dragHandle}>⠿</span>
                  </>
                )}
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
    </div>
  )
}
