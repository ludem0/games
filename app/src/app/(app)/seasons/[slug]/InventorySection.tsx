'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './season.module.css'

interface Entry {
  username: string
  psigems: number
  opals: number
  tol: number
  clearOpals: number
}

type Field = 'psigems' | 'opals' | 'tol' | 'clearOpals'

const ITEMS: { field: Field; icon: string; color: string; name: string }[] = [
  { field: 'psigems', icon: 'Ψ', color: '#a855f7', name: 'псигемы' },
  { field: 'opals', icon: '◈', color: '#38bdf8', name: 'опалы' },
  { field: 'tol', icon: '🛡', color: '#4ade80', name: 'жетоны неуязвимости' },
  { field: 'clearOpals', icon: '◇', color: '#e2e8f0', name: 'прозрачные опалы' },
]

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  username: string
}

export default function InventorySection({ slug, accent, isAdmin, username }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [saving, setSaving] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/seasons/${slug}/inventory`)
    if (res.ok) setEntries(await res.json())
  }, [slug])

  useEffect(() => { load() }, [load])

  async function change(target: string, field: Field, delta: number) {
    const entry = entries.find(e => e.username === target)
    if (!entry) return
    setSaving(`${target}:${field}`)
    const res = await fetch(`/api/seasons/${slug}/inventory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: target, [field]: Math.max(0, entry[field] + delta) }),
    })
    setSaving('')
    if (res.ok) {
      const updated = await res.json()
      setEntries(list => list.map(e => (e.username === target ? updated : e)))
    }
  }

  const mine = entries.find(e => e.username === username)

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ИНВЕНТАРЬ</span>
      </div>

      {!isAdmin && (
        mine ? (
          <div className={styles.invMine}>
            {ITEMS.map(item => (
              <div key={item.field} className={styles.invItem}>
                <span className={styles.invIcon} style={{ color: item.color }}>{item.icon}</span>
                <span className={styles.invCount}>{mine[item.field]}</span>
                <span className={styles.invName}>{item.name}</span>
              </div>
            ))}
          </div>
        ) : <p className={styles.noContent}>Вас нет в этом сезоне</p>
      )}

      {isAdmin && (
        entries.length === 0 ? <p className={styles.noContent}>Участники не назначены</p> : (
          <div className={styles.invTableWrap}>
            <table className={styles.invTable}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Игрок</th>
                  {ITEMS.map(item => <th key={item.field}>{item.icon} {item.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.username}>
                    <td className={styles.invPlayer}>{e.username}</td>
                    {ITEMS.map(({ field }) => (
                      <td key={field}>
                        <div className={styles.invEditor}>
                          <button className={styles.invBtn} disabled={saving !== ''}
                            onClick={() => change(e.username, field, -1)}>−</button>
                          <span className={styles.invValue} style={{ color: accent }}>{e[field]}</span>
                          <button className={styles.invBtn} disabled={saving !== ''}
                            onClick={() => change(e.username, field, 1)}>+</button>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
