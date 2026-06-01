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
    <div className={`${styles.avatarInitials} ${className ?? ''}`} style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {initials}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 70 ? '#00FCED' : score >= 40 ? '#B026FF' : '#FF2A6D'
  const glow = score >= 70 ? 'rgba(0,252,237,0.7)' : score >= 40 ? 'rgba(176,38,255,0.7)' : 'rgba(255,42,109,0.7)'
  return (
    <svg className={styles.scoreRing} width="136" height="136" viewBox="0 0 136 136">
      <circle cx="68" cy="68" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
      <circle
        cx="68" cy="68" r={r} fill="none"
        stroke={color} strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ filter: `drop-shadow(0 0 10px ${glow})` }}
      />
      <text x="68" y="63" textAnchor="middle" fill="white" fontSize="30" fontWeight="800" fontFamily="Poppins,sans-serif">
        {score}
      </text>
      <text x="68" y="80" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8.5" letterSpacing="2.5" fontFamily="inherit">
        SCORE
      </text>
    </svg>
  )
}

function frac(wins: number, total: number) {
  if (total === 0) return null
  return { wins, total, pct: Math.round(wins / total * 100) }
}

function avgPlacementInfo(stats: PlayerStats) {
  const valid = stats.seasons.filter(s => s.rank != null)
  if (valid.length === 0) return null
  const avg = valid.reduce((a, s) => a + s.rank!, 0) / valid.length
  const places = valid.map(s => s.rank!)
  return { avg: Math.round(avg * 10) / 10, places }
}

function RankingTab({ allPlayers, allStats, currentUser }: {
  allPlayers: string[]
  allStats: Record<string, PlayerStats>
  currentUser: string
}) {
  const ranked = allPlayers
    .filter(p => allStats[p])
    .map(p => ({ username: p, score: computePerformanceScore(allStats[p]), stats: allStats[p] }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className={styles.rankingSection}>
      <div className={styles.rankTable}>
        <div className={styles.rankTableHead}>
          <span style={{ width: 36 }}>#</span>
          <span style={{ width: 36 }} />
          <span style={{ flex: 1 }}>Игрок</span>
          <span style={{ width: 96 }}>Место avg</span>
          <span style={{ width: 90 }}>MM wins</span>
          <span style={{ width: 90 }}>DM wins</span>
          <span style={{ width: 52 }}>MM🔥</span>
          <span style={{ width: 52 }}>DM⚡</span>
          <span style={{ width: 60 }}>Score</span>
        </div>

        {ranked.map((entry, i) => {
          const rank = i + 1
          const s = entry.stats.totals
          const mm = frac(s.mmWins, s.mmParticipations)
          const dm = frac(s.dmWins, s.dmParticipations)
          const placement = avgPlacementInfo(entry.stats)
          return (
            <div key={entry.username} className={`${styles.rankRow} ${entry.username === currentUser ? styles.rankRowSelf : ''} ${rank <= 3 ? styles[`rankRowTop${rank}` as keyof typeof styles] : ''}`}>
              <span className={`${styles.rankNum} ${rank <= 3 ? styles.rankNumTop : ''}`}>{rank}</span>
              <Avatar username={entry.username} size={36} className={styles.rankAvatar} />
              <span className={styles.rankName}>{entry.username}</span>

              <span className={styles.rankCell}>
                {placement ? (
                  <>
                    <span className={styles.rankCellMain}>{placement.avg}</span>
                    <span className={styles.rankCellSub}>({placement.places.join(', ')})</span>
                  </>
                ) : <span className={styles.rankCellMuted}>—</span>}
              </span>

              <span className={styles.rankCell}>
                {mm ? (
                  <>
                    <span className={styles.rankCellNeon}>{mm.wins}/{mm.total}</span>
                    <span className={styles.rankCellSub}>{mm.pct}%</span>
                  </>
                ) : <span className={styles.rankCellMuted}>—</span>}
              </span>

              <span className={styles.rankCell}>
                {dm ? (
                  <>
                    <span className={styles.rankCellHot}>{dm.wins}/{dm.total}</span>
                    <span className={styles.rankCellSub}>{dm.pct}%</span>
                  </>
                ) : <span className={styles.rankCellMuted}>—</span>}
              </span>

              <span className={styles.rankCellCenter}>
                {s.mmWinStreak > 0 ? <span className={styles.streakVal}>{s.mmWinStreak}</span> : <span className={styles.rankCellMuted}>—</span>}
              </span>

              <span className={styles.rankCellCenter}>
                {s.dmWinStreak > 0 ? <span className={styles.streakVal}>{s.dmWinStreak}</span> : <span className={styles.rankCellMuted}>—</span>}
              </span>

              <span className={styles.rankScoreVal}>{entry.score}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function rate(wins: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round(wins / total * 100)}%`
}

export default function StatsClient({ username, role, allStats, allPlayers }: Props) {
  const [tab, setTab] = useState<Tab>('my')
  const [selected, setSelected] = useState(username)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const stats = allStats[selected]
  const score = stats ? computePerformanceScore(stats) : 0

  return (
    <div className={styles.page}>
      <div className={styles.bgLayer} aria-hidden />

      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navLogo}>PG</div>
        <div style={{ width: 80 }} />
      </nav>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'my' ? styles.tabActive : ''}`} onClick={() => setTab('my')}>
          Моя статистика
        </button>
        <button className={`${styles.tab} ${tab === 'ranking' ? styles.tabActive : ''}`} onClick={() => setTab('ranking')}>
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
                    {(() => {
                      const p = avgPlacementInfo(stats)
                      return p ? (
                        <span className={styles.avgPlacement}>
                          Avg место: <strong>{p.avg}</strong>
                          <span className={styles.placementSeasons}> ({p.places.join(', ')})</span>
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>

                <div className={styles.statGrid}>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>MM участий</span>
                    <span className={styles.statBlockValue}>{stats.totals.mmParticipations}</span>
                    <span className={styles.statBlockSub}>Win rate: {rate(stats.totals.mmWins, stats.totals.mmParticipations)}</span>
                  </div>
                  <div className={`${styles.statBlock} ${styles.statBlockNeon}`}>
                    <span className={styles.statBlockLabel}>Иммунитеты</span>
                    <span className={`${styles.statBlockValue} ${styles.statBlockValueNeon}`}>
                      {stats.totals.mmWins}
                      <span className={styles.statBlockFrac}>/{stats.totals.mmParticipations}</span>
                    </span>
                    <span className={styles.statBlockSub}>Стрик: {stats.totals.mmWinStreak}</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>DM участий</span>
                    <span className={styles.statBlockValue}>{stats.totals.dmParticipations}</span>
                    <span className={styles.statBlockSub}>Win rate: {rate(stats.totals.dmWins, stats.totals.dmParticipations)}</span>
                  </div>
                  <div className={`${styles.statBlock} ${styles.statBlockHot}`}>
                    <span className={styles.statBlockLabel}>DM побед</span>
                    <span className={`${styles.statBlockValue} ${styles.statBlockValueHot}`}>
                      {stats.totals.dmWins}
                      <span className={styles.statBlockFrac}>/{stats.totals.dmParticipations}</span>
                    </span>
                    <span className={styles.statBlockSub}>Стрик: {stats.totals.dmWinStreak}</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>MM стрик 🔥</span>
                    <span className={styles.statBlockValue}>{stats.totals.mmWinStreak}</span>
                    <span className={styles.statBlockSub}>подряд</span>
                  </div>
                  <div className={styles.statBlock}>
                    <span className={styles.statBlockLabel}>DM стрик ⚡</span>
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
                              <span className={styles.seasonStatVal}>{s.mmWins}/{s.mmParticipations}</span>
                              <span className={styles.seasonStatLbl}>MM wins</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{rate(s.mmWins, s.mmParticipations)}</span>
                              <span className={styles.seasonStatLbl}>MM%</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{s.dmWins}/{s.dmParticipations}</span>
                              <span className={styles.seasonStatLbl}>DM wins</span>
                            </div>
                            <div className={styles.seasonStat}>
                              <span className={styles.seasonStatVal}>{rate(s.dmWins, s.dmParticipations)}</span>
                              <span className={styles.seasonStatLbl}>DM%</span>
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
