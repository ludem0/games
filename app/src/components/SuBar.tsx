'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './SuBar.module.css'

interface Props {
  names: string[]
  current: string
  /** the admin who started the chain, null while the real admin is logged in */
  origin: string | null
}

/**
 * A seat switcher for testing. Lets one person walk a whole match through without
 * juggling browser profiles. Rendered only when TEST_TOOLS is on.
 */
export default function SuBar({ names, current, origin }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const go = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className={styles.pill} onClick={() => setOpen(true)}>
        {origin ? `${current} ⇠ ${origin}` : current} ⚙
      </button>
    )
  }

  return (
    <div className={styles.bar}>
      <div className={styles.head}>
        <span className={styles.title}>Тест: сменить игрока</span>
        <button className={styles.close} onClick={() => setOpen(false)}>✕</button>
      </div>
      <select
        className={styles.select}
        value={current}
        disabled={busy}
        onChange={e => go('/api/auth/su', { username: e.target.value })}
      >
        {names.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      {origin && (
        <button className={styles.back} disabled={busy} onClick={() => go('/api/auth/su/exit')}>
          Вернуться в {origin}
        </button>
      )}
    </div>
  )
}
