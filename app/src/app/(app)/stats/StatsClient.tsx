'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { PlayerStats } from '@/lib/stats'
import styles from './stats.module.css'

interface Props {
  username: string
  role: Role
  allStats: Record<string, PlayerStats>
  allPlayers: string[]
}

export default function StatsClient({ username, role, allStats, allPlayers }: Props) {
  const [selected, setSelected] = useState(username)
  const stats = allStats[selected]

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navLogo}>PG</div>
        <div style={{ width: 80 }} />
      </nav>

      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.title}>Статистика</span>
          {role === 'admin' && allPlayers.length > 0 && (
            <select
              className={styles.playerSelect}
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              {allPlayers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>

        {!stats ? (
          <div className={styles.noData}>Нет данных по завершённым сезонам</div>
        ) : (
          <>
            <div className={styles.sectionLabel}>Итого</div>
            <div className={styles.totalsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>MM участий</span>
                <span className={styles.statValue}>{stats.totals.mmParticipations}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Иммунитеты</span>
                <span className={`${styles.statValue} ${styles.statValueAccent}`}>{stats.totals.mmWins}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>DM участий</span>
                <span className={styles.statValue}>{stats.totals.dmParticipations}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>DM побед</span>
                <span className={styles.statValue}>{stats.totals.dmWins}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Серия MM</span>
                <span className={styles.statValue}>{stats.totals.mmWinStreak}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Серия DM</span>
                <span className={styles.statValue}>{stats.totals.dmWinStreak}</span>
              </div>
            </div>

            {stats.seasons.length === 0 ? (
              <div className={styles.noData}>Игрок не участвовал ни в одном завершённом сезоне</div>
            ) : (
              <>
                <div className={styles.sectionLabel}>По сезонам</div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Сезон</th>
                      <th>Место</th>
                      <th>MM участий</th>
                      <th>Иммунитеты</th>
                      <th>DM участий</th>
                      <th>DM побед</th>
                      <th>Серия MM</th>
                      <th>Серия DM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.seasons.map(s => (
                      <tr key={s.slug}>
                        <td>{s.seasonName}</td>
                        <td className={styles.rankCell}>
                          {s.rank != null ? `${s.rank} из ${s.rankTotal}` : '—'}
                        </td>
                        <td>{s.mmParticipations}</td>
                        <td>{s.mmWins}</td>
                        <td>{s.dmParticipations}</td>
                        <td>{s.dmWins}</td>
                        <td>{s.mmWinStreak}</td>
                        <td>{s.dmWinStreak}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
