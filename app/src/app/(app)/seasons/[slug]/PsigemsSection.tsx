'use client'

import { useState } from 'react'
import styles from './psigems.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  participants: string[]
  initialPsigems: Record<string, number>
}

export default function PsigemsSection({ slug, accent, isAdmin, participants, initialPsigems }: Props) {
  const [psigems, setPsigems] = useState<Record<string, number>>(initialPsigems)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>(initialPsigems)
  const [saving, setSaving] = useState(false)

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  function startEdit() {
    setDraft({ ...psigems })
    setEditing(true)
  }

  function adjust(name: string, delta: number) {
    setDraft(prev => ({ ...prev, [name]: Math.max(0, (prev[name] ?? 1) + delta) }))
  }

  function setVal(name: string, val: string) {
    const n = parseInt(val)
    if (!isNaN(n) && n >= 0) setDraft(prev => ({ ...prev, [name]: n }))
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/seasons/${slug}/psigems`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) {
      const updated = await res.json()
      setPsigems(updated)
    }
    setSaving(false)
    setEditing(false)
  }

  const sorted = [...participants].sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.psiSymbol} style={{ color: accent }}>Ψ</span>
          <span className={styles.label}>ПСИГЕМЫ</span>
        </div>
        {isAdmin && !editing && (
          <button className={styles.btnEdit} onClick={startEdit}>Редактировать</button>
        )}
        {isAdmin && editing && (
          <div className={styles.editActions}>
            <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
              {saving ? '...' : 'Сохранить'}
            </button>
            <button className={styles.btnCancel} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {(editing ? participants : sorted).map((p, idx) => {
          const val = editing ? (draft[p] ?? 1) : (psigems[p] ?? 1)
          const isTop = !editing && idx === 0
          return (
            <div key={p} className={`${styles.playerRow} ${isTop ? styles.topRow : ''}`}
              style={isTop ? { borderColor: `${accent}55`, background: `${accent}08` } : {}}>
              <span className={styles.rank} style={isTop ? { color: accent } : {}}>{!editing ? idx + 1 : '–'}</span>
              <span className={styles.avatar} style={{ background: `${accent}18`, color: accent, borderColor: `${accent}45` }}>
                {initials(p)}
              </span>
              <span className={styles.name}>{p}</span>
              {editing ? (
                <div className={styles.controls}>
                  <button className={styles.adjBtn} onClick={() => adjust(p, -1)}>−</button>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={draft[p] ?? 1}
                    onChange={e => setVal(p, e.target.value)}
                    min={0}
                  />
                  <button className={styles.adjBtn} onClick={() => adjust(p, 1)}>+</button>
                </div>
              ) : (
                <span className={styles.psiVal} style={isTop ? { color: accent } : {}}>
                  {val} <span className={styles.psiUnit}>Ψ</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
