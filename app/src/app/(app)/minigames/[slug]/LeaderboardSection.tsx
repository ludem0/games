'use client'

import { useState, useEffect } from 'react'
import styles from './minigame.module.css'

interface Entry {
  username: string
  points: number
  psigems: number
}

interface Props {
  gameSlug: string
  participants: string[]
}

export default function LeaderboardSection({ gameSlug }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      const res = await fetch(`/api/minigames/${gameSlug}/leaderboard`)
      if (res.ok && active) setEntries(await res.json())
    }
    load()
    const id = setInterval(load, 8000)
    return () => { active = false; clearInterval(id) }
  }, [gameSlug])

  return (
    <div className={styles.lbWrap}>
      <div className={styles.lbHeader}>
        <span style={{ width: 36 }}>#</span>
        <span style={{ flex: 1 }}>Игрок</span>
        <span style={{ width: 80 }}>Очки</span>
        <span style={{ width: 80 }}>Псигемы</span>
      </div>
      {entries.map((e, i) => (
        <div key={e.username} className={styles.lbRow}>
          <span className={styles.lbRank}>{i + 1}</span>
          <span className={styles.lbName}>{e.username}</span>
          <span className={styles.lbPts}>{e.points}</span>
          <span className={styles.lbPsi}>Ψ {e.psigems}</span>
        </div>
      ))}
      {entries.length === 0 && <div className={styles.noData}>Нет данных</div>}
    </div>
  )
}
