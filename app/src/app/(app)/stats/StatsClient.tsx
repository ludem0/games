'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { PlayerStats } from '@/lib/stats'
import { computePerformanceScore } from '@/lib/stats'
import styles from './stats.module.css'

interface Props {
  username: string
  role: Role
  allStats: Record<string, PlayerStats>
  allPlayers: string[]
}

type Tab = 'my' | 'ranking'

function useAvatarUrl(username: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(username)}/avatar`)
      .then(r => r.ok ? r.json() : { avatarUrl: null })
      .then(d => setUrl(d.avatarUrl ?? null))
      .catch(() => setUrl(null))
  }, [username])
  return url
}

function Avatar({ username, size = 40, className }: { username: string; size?: number; className?: string }) {
  const url = useAvatarUrl(username)
  const initials = username.slice(0, 2).toUpperCase()
  if (url) {
    return <img src={url} alt={username} width={size} height={size} className={`${styles.avatarImg} ${className ?? ''}`} />
  }
  return (
    <div className={`${styles.avatarInitials} ${className ?? ''}`} style={{ width: size, height: size, fontSize: size * 0.28 }}>
      {initials}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  return (
    <svg className={styles.scoreRing} width="136" height="136" viewBox="0 0 136 136">
      <circle cx="68" cy="68" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle
        cx="68" cy="68" r={r} fill="none"
        stroke="var(--neon)" strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ filter: 'drop-shadow(0 0 8px rgba(0,252,237,0.6))' }}
      />
      <text x="68" y="62" textAnchor="middle" fill="var(--text)" fontSize="28" fontWeight="700" fontFamily="Poppins,sans-serif">
        {score}
      </text>
      <text x="68" y="80" textAnchor="middle" fill="var(--muted)" fontSize="9" letterSpacing="2" fontFamily="inherit">
        SCORE
      </text>
    </svg>
  )
}

function rate(wins: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round(wins / total * 100)}%`
}

function RankingTab({ allPlayers, allStats, currentUser }: { allPlayers: string[]; allStats: Record<string, PlayerStats>; currentUser: string }) {
  const ranked = allPlayers
    .filter(p => allStats[p])
    .map(p => ({ username: p, score: computePerformanceScore(allStats[p]), stats: allStats[p] }))
    .sort((a, b) => b.score - a.score)

  const top3 = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
    ? [top3[1], top3[0]]
    : top3
  const podiumHeights: Record<number, number> = { 0: 70, 1: 100, 2: 50 }

  return (
    <div className={styles.rankingSection}>
      {top3.length > 0 && (
        <div className={styles.podium}>
          {podiumOrder.map((entry, i) => {
            const realRank = ranked.indexOf(entry) + 1
            const podiumH = podiumHeights[i] ?? 70
            return (
              <div
                key={entry.username}
                className={`${styles.podiumSlot} ${entry.username === currentUser ? styles.podiumSelf : ''} ${realRank === 1 ? styles.podiumFirst : ''}`}
              >
                <div className={styles.podiumMeta}>
                  <Avatar
                    username={entry.username}
                    size={realRank === 1 ? 56 : 44}
                    className={realRank === 1 ? styles.podiumAvatarLarge : styles.podiumAvatar}
                  />
                  <span className={styles.podiumName}>{entry.username}</span>
                  <span className={styles.podiumScore}>{entry.score}</span>
                </div>
                <div className={styles.podiumBlock} style={{ height: podiumH }}>
                  <span className={styles.podiumRankNum}>{realRank}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.rankListHeader}>
        <span className={styles.rankListCol} style={{ width: 28 }}>#</span>
        <span className={styles.rankListCol} style={{ flex: 1 }}>Игрок</span>
        <span className={styles.rankListCol} style={{ width: 140 }}>Score</span>
        <span className={styles.rankListCol} style={{ width: 60 }}>MM%</span>
        <span className={styles.rankListCol} style={{ width: 60 }}>DM%</span>
      </div>

      <div className={styles.rankList}>
        {rest.map((entry, i) => {
          const rank = i + 4
          const maxScore = ranked[0]?.score ?? 1
          const barW = maxScore > 0 ? (entry.score / maxScore) * 100 : 0
          const s = entry.stats.totals
          return (
            <div key={entry.username} className={`${styles.rankRow} ${entry.username === currentUser ? styles.rankRowSelf : ''}`}>
              <span className={styles.rankNum}>{rank}</span>
              <Avatar username={entry.username} size={32} className={styles.rankAvatar} />
              <span className={styles.rankName}>{entry.username}</span>
              <div className={styles.rankBarWrap}>
                <div className={styles.rankBar} style={{ width: `${barW}%` }} />
                <span className={styles.rankScore}>{entry.score}</span>
              </div>
              <span className={styles.rankStat}>{rate(s.mmWins, s.mmParticipations)}</span>
              <span className={styles.rankStat}>{rate(s.dmWins, s.dmParticipations)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StatsClient({ username, role, allStats, allPlayers }: Props) {
  const [tab, setTab] = useState<Tab>('my')
  const [selected, setSelected] = useState(username)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const stats = allStats[selected]
  const score = stats ? computePerformanceScore(stats) : 0

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navLogo}>PG</div>
        <div style={{ width: 80 }} />
      </nav>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'my' ? styles.tabActive : ''}`}
          onClick={() => setTab('my')}
        >
          Моя статистика
        </button>
        <button
          className={`${styles.tab} ${tab === 'ranking' ? styles.tabActive : ''}`}
          onClick={() => setTab('ranking')}
        >
          Рейтинг игроков
        </button>
      </div>

      <div className={styles.content}>
        {tab === 'my' && (
          <>
            {role === 'admin' && allPlayers.length > 0 && (
              <div className={styles.dropdownWrap}>
                <button className={styles.dropdownBtn} onClick={() => setDropdownOpen(o => !o)}>
                  <Avatar username={selected} size={22} className={styles.dropdownAvatar} />
                  <span>{selected}</span>
                  <span className={styles.dropdownArrow}>{dropdownOpen ? '▲' : '▼'}</span>
                </button>
                {dropdownOpen && (
                  <div className={styles.dropdownList}>
                    {allPlayers.map(p => (
                      <button
                        key={p}
                        className={`${styles.dropdownItem} ${p === selected ? styles.dropdownItemActive : ''}`}
                        onClick={() => { setSelected(p); setDropdownOpen(false) }}
                      >
                        <Avatar username={p} size={20} className={styles.dropdownItemAvatar} />
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!stats ? (
              <div className={styles.noData}>Нет данных по завершённым сезонам</div>
            ) : (
              <>
                <div className={styles.scoreHero}>
                  <ScoreRing score={score} />
                  <div className={styles.scoreLabels}>
                    <span className={styles.scoreName}>{selected}</span>
                    <span className={styles.scoreDesc}>Performance Score</span>
                    <span className={styles.scoreTier}>
                      {score >= 70 ? '🏆 Топ игрок' : score >= 40 ? '⚡ Хорошо' : '📈 Развивается'}
                    </span>
                  </div>
                </div>

                <div className={styles.statGrid}>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>MM участий</span>
                    <span className={styles.statBlockValue}>{stats.totals.mmParticipations}</span>
                    <span className={styles.statBlockSub}>Win rate: {rate(stats.totals.mmWins, stats.totals.mmParticipations)}</span>
                  </div>
                  <div className={`${styles.statBlock} ${styles.statBlockHighlight}`}>
                    <span className={styles.statBlockLabel}>Иммунитеты</span>
                    <span className={`${styles.statBlockValue} ${styles.statBlockValueNeon}`}>{stats.totals.mmWins}</span>
                    <span className={styles.statBlockSub}>Стрик: {stats.totals.mmWinStreak}</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>DM участий</span>
                    <span className={styles.statBlockValue}>{stats.totals.dmParticipations}</span>
                    <span className={styles.statBlockSub}>Win rate: {rate(stats.totals.dmWins, stats.totals.dmParticipations)}</span>
                  </div>
                  <div className={`${styles.statBlock} ${styles.statBlockHighlight}`}>
                    <span className={styles.statBlockLabel}>DM побед</span>
                    <span className={`${styles.statBlockValue} ${styles.statBlockValueHot}`}>{stats.totals.dmWins}</span>
                    <span className={styles.statBlockSub}>Стрик: {stats.totals.dmWinStreak}</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>MM стрик</span>
                    <span className={styles.statBlockValue}>{stats.totals.mmWinStreak}</span>
                    <span className={styles.statBlockSub}>подряд</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>DM стрик</span>
                    <span className={styles.statBlockValue}>{stats.totals.dmWinStreak}</span>
                    <span className={styles.statBlockSub}>подряд</span>
                  </div>
                </div>

                {stats.seasons.length > 0 && (
                  <>
                    <div className={styles.sectionLabel}>По сезонам</div>
                    <div className={styles.seasonCards}>
                      {stats.seasons.map(s => (
                        <div key={s.slug} className={styles.seasonCard}>
                          <div className={styles.seasonCardHeader}>
                            <span className={styles.seasonCardName}>{s.seasonName}</span>
                            <span className={styles.seasonCardRank}>
                              {s.rank != null ? `${s.rank} / ${s.rankTotal}` : '—'}
                            </span>
                          </div>
                          <div className={styles.seasonCardStats}>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{s.mmWins}</span>
                              <span className={styles.seasonStatLbl}>иммун.</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{rate(s.mmWins, s.mmParticipations)}</span>
                              <span className={styles.seasonStatLbl}>MM win%</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{s.dmParticipations}</span>
                              <span className={styles.seasonStatLbl}>DM всего</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{rate(s.dmWins, s.dmParticipations)}</span>
                              <span className={styles.seasonStatLbl}>DM win%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === 'ranking' && (
          <RankingTab allPlayers={allPlayers} allStats={allStats} currentUser={username} />
        )}
      </div>
    </div>
  )
}
