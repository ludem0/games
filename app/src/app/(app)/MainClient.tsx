'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import CubeSimply from '@/components/CubeSimply'
import CubeZero from '@/components/CubeZero'
import CubeGambit from '@/components/CubeGambit'
import { SEASONS_CONFIG } from '@/lib/seasonsConfig'
import styles from './main.module.css'

function usePresence() {
  const [online, setOnline] = useState<string[]>([])

  const refresh = useCallback(() => {
    fetch('/api/presence').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.online) setOnline(d.online)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/presence', { method: 'POST' }).catch(() => {})
    refresh()
    const pingId = setInterval(() => fetch('/api/presence', { method: 'POST' }).catch(() => {}), 30_000)
    const pollId = setInterval(refresh, 30_000)
    return () => { clearInterval(pingId); clearInterval(pollId) }
  }, [refresh])

  return online
}

function PresenceAvatar({ username }: { username: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(username)}/avatar`)
      .then(r => r.ok ? r.json() : { avatarUrl: null })
      .then(d => setUrl(d.avatarUrl ?? null))
      .catch(() => {})
  }, [username])
  return url
    ? <img src={url} alt={username} className={styles.presenceAvatar} title={username} />
    : <div className={styles.presenceAvatarInitials} title={username}>{username.slice(0, 2).toUpperCase()}</div>
}

const CUBE_MAP: Record<string, React.ComponentType> = { simply: CubeSimply, zero: CubeZero, gambit: CubeGambit }

const SEASONS = Object.entries(SEASONS_CONFIG).map(([id, cfg]) => ({
  id,
  name: cfg.name,
  Cube: CUBE_MAP[id] ?? CubeSimply,
  glowColor: cfg.glowColor,
  status: cfg.status,
  statusLabel: cfg.statusLabel,
}))

const BADGE_MAP: Record<Role, { label: string; cls: string }> = {
  admin:  { label: 'Админ',    cls: styles.badgeAdmin },
  player: { label: 'Игрок',   cls: styles.badgePlayer },
  viewer: { label: 'Зритель', cls: styles.badgeViewer },
}

interface Props { username: string; role: Role }

export default function MainClient({ username, role }: Props) {
  const router = useRouter()
  const badge = BADGE_MAP[role]
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const online = usePresence()

  useEffect(() => {
    fetch('/api/me/avatar')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.avatarUrl && setAvatarUrl(d.avatarUrl))
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const initials = username.slice(0, 2).toUpperCase()

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.navLogo}>PG</div>
        <div className={styles.navRight}>
          {role === 'admin' && (
            <Link href="/admin" className={styles.adminLink}>Игроки</Link>
          )}
          {(role === 'player' || role === 'admin') && (
            <Link href="/stats" className={styles.adminLink}>Статистика</Link>
          )}
          <Link href="/profile" className={styles.avatarBtn} title="Мой профиль">
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className={styles.avatarImg} />
              : <span className={styles.avatarInitials}>{initials}</span>
            }
          </Link>
          <div className={styles.userInfo}>
            <span className={styles.username}>{username}</span>
            <span className={`${styles.badge} ${badge.cls}`}>{badge.label}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>Выйти</button>
        </div>
      </nav>

      <main className={styles.content}>
        <div className={styles.seasonsLabel}>SEASONS</div>
        <div className={styles.seasonsGrid}>
          {SEASONS.map(({ id, name, Cube, glowColor, status, statusLabel }) => (
            <Link
              key={id}
              href={`/seasons/${id}`}
              className={styles.seasonCard}
              style={{ '--glow': glowColor } as React.CSSProperties}
            >
              <div className={styles.cubeWrap}><Cube /></div>
              <div className={styles.cardBottom}>
                <div className={styles.seasonName}>{name}</div>
                <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                  {status === 'active' && <span className={styles.dot} />}
                  {statusLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {online.length > 0 && (
        <div className={styles.presenceBar}>
          <span className={styles.presenceDot} />
          <span className={styles.presenceLabel}>{online.length} онлайн</span>
          <div className={styles.presenceList}>
            {online.map(u => <PresenceAvatar key={u} username={u} />)}
          </div>
        </div>
      )}
    </>
  )
}
