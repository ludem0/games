'use client'

import { useState } from 'react'
import styles from './season.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  participants: string[]
  initialPsigems: Record<string, number>
}

export default function LeaderboardSection({ slug, accent, isAdmin, participants, initialPsigems }: Props) {
  const [psigems, setPsigems] = useState<Record<string, number>>(initialPsigems)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>(initialPsigems)
  const [saving, setSaving] = useState(false)

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  const sorted = [...participants].sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))
  const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32']

  function startEdit() { setDraft({ ...psigems }); setEditing(true) }
  function adjust(name: string, delta: number) {
    setDraft(prev => ({ ...prev, [name]: Math.max(0, (prev[name] ?? 1) + delta) }))
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/seasons/${slug}/psigems`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) setPsigems(await res.json())
    setSaving(false)
    setEditing(false)
  }

  if (participants.length === 0) return null

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ЛИДЕРБОРД</span>
        {isAdmin && !editing && (
          <button className={styles.btnOutline} onClick={startEdit}>Ψ Редактировать</button>
        )}
        {isAdmin && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnAccent} onClick={handleSave} disabled={saving}>
              {saving ? '...' : 'Сохранить'}
            </button>
            <button className={styles.btnOutline} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        )}
      </div>

      <div className={styles.rankList}>
        {(editing ? participants : sorted).map((name, i) => {
          const val = editing ? (draft[name] ?? 1) : (psigems[name] ?? 1)
          const color = editing ? accent : (MEDALS[i] ?? accent)
          return (
            <div
              key={name}
              className={`${styles.rankRow} ${!editing && i === 0 ? styles.rankRow1 : !editing && i === 1 ? styles.rankRow2 : !editing && i === 2 ? styles.rankRow3 : ''}`}
            >
              <span className={`${styles.rankNum} ${!editing && i === 0 ? styles.rankNum1 : ''}`} style={{ color }}>
                {editing ? '–' : i + 1}
              </span>
              <span
                className={`${styles.rankAvatar} ${!editing && i === 0 ? styles.rankAvatar1 : ''}`}
                style={{ background: `${color}18`, color, borderColor: `${color}45` }}
              >
                {initials(name)}
              </span>
              <span className={`${styles.rankName} ${!editing && i === 0 ? styles.rankName1 : ''}`}>{name}</span>

              {editing ? (
                <div className={styles.psiControls}>
                  <button className={styles.psiBtn} onClick={() => adjust(name, -1)}>−</button>
                  <span className={styles.psiVal}>{draft[name] ?? 1}</span>
                  <button className={styles.psiBtn} onClick={() => adjust(name, 1)}>+</button>
                  <span className={styles.psiUnit}>Ψ</span>
                </div>
              ) : (
                <span className={styles.psiDisplay}>
                  {val}<span className={styles.psiUnit}> Ψ</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
