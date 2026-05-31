'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import CubeSimply from '@/components/CubeSimply'
import CubeZero from '@/components/CubeZero'
import CubeGambit from '@/components/CubeGambit'
import styles from './main.module.css'

const SEASONS = [
  { id: 'simply', name: 'PG: Simply',        Cube: CubeSimply, glowColor: 'rgba(255,220,0,0.35)',    status: 'done',   statusLabel: 'Завершён' },
  { id: 'zero',   name: 'PG: Zero',          Cube: CubeZero,   glowColor: 'rgba(200,200,200,0.25)',  status: 'done',   statusLabel: 'Завершён' },
  { id: 'gambit', name: 'PG: Puzzle Gambit', Cube: CubeGambit, glowColor: 'rgba(176,38,255,0.35)',   status: 'active', statusLabel: 'Идёт'     },
]

const BADGE_MAP: Record<Role, { label: string; cls: string }> = {
  admin:  { label: 'Админ',    cls: styles.badgeAdmin },
  player: { label: 'Игрок',   cls: styles.badgePlayer },
  viewer: { label: 'Зритель', cls: styles.badgeViewer },
}

interface Props { username: string; role: Role }

export default function MainClient({ username, role }: Props) {
  const router = useRouter()
  const badge = BADGE_MAP[role]

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.navLogo}>PG</div>
        <div className={styles.navRight}>
          {role === 'admin' && (
            <Link href="/admin" className={styles.adminLink}>Игроки</Link>
          )}
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
              <div className={styles.seasonName}>{name}</div>
              <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                {status === 'active' && <span className={styles.dot} />}
                {statusLabel}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  )
}
