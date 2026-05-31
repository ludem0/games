'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import CubeSimply from '@/components/CubeSimply'
import CubeZero from '@/components/CubeZero'
import CubeGambit from '@/components/CubeGambit'
import LeaderboardSection from './LeaderboardSection'
import styles from './season.module.css'

const CUBES: Record<string, React.ComponentType> = {
  simply: CubeSimply,
  zero: CubeZero,
  gambit: CubeGambit,
}

interface Props {
  slug: string
  name: string
  status: 'done' | 'active' | 'soon'
  statusLabel: string
  accent: string
  role: Role
  username: string
  initialParticipants: string[]
  allPlayers: string[]
  initialRanks: string[]
}

export default function SeasonClient({
  slug, name, status, statusLabel, accent,
  role, username, initialParticipants, allPlayers, initialRanks,
}: Props) {
  const Cube = CUBES[slug] ?? CubeSimply
  const [participants, setParticipants] = useState(initialParticipants)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const available = allPlayers.filter(p => !participants.includes(p))

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAdd(player: string) {
    setDropdownOpen(false)
    const res = await fetch(`/api/seasons/${slug}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: player }),
    })
    if (res.ok) {
      const d = await res.json()
      setParticipants(d.participants)
    }
  }

  async function handleRemove(player: string) {
    const res = await fetch(`/api/seasons/${slug}/participants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: player }),
    })
    if (res.ok) {
      const d = await res.json()
      setParticipants(d.participants)
    }
  }

  const initials = (name: string) => name.slice(0, 2).toUpperCase()

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Seasons</Link>
        <div className={styles.navLogo}>PG</div>
        <div className={styles.navUser}>{username}</div>
      </nav>

      <main className={styles.content}>
        <div className={styles.cubeWrap}><Cube /></div>
        <h1 className={styles.name} style={{ color: accent }}>{name}</h1>
        <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
          {status === 'active' && <span className={styles.dot} />}
          {statusLabel}
        </span>

        <section className={styles.participantsSection}>
          <div className={styles.participantsHeader}>
            <span className={styles.participantsLabel}>УЧАСТНИКИ</span>
            {role === 'admin' && (
              <div className={styles.addWrap} ref={dropdownRef}>
                <button
                  className={styles.addBtn}
                  onClick={() => setDropdownOpen(v => !v)}
                  disabled={available.length === 0}
                >
                  + Добавить
                </button>
                {dropdownOpen && available.length > 0 && (
                  <ul className={styles.dropdown}>
                    {available.map(p => (
                      <li key={p} className={styles.dropdownItem} onClick={() => handleAdd(p)}>
                        <span className={styles.dropdownAvatar} style={{ background: `${accent}33` }}>
                          {initials(p)}
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {participants.length === 0 ? (
            <p className={styles.noParticipants}>Участники не назначены</p>
          ) : (
            <div className={styles.participantsGrid}>
              {participants.map(p => (
                <div key={p} className={styles.playerCard}>
                  <div className={styles.avatar} style={{ background: `${accent}22`, borderColor: `${accent}55` }}>
                    <span style={{ color: accent }}>{initials(p)}</span>
                  </div>
                  <span className={styles.playerName}>{p}</span>
                  {role === 'admin' && (
                    <button className={styles.removeBtn} onClick={() => handleRemove(p)}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <LeaderboardSection
          slug={slug}
          accent={accent}
          isAdmin={role === 'admin'}
          initialRanks={initialRanks}
          participants={initialParticipants}
        />
      </main>
    </div>
  )
}
