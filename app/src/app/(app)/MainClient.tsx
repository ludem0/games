'use client'

import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/types'
import CubeSimply from '@/components/CubeSimply'
import CubeZero from '@/components/CubeZero'
import CubeGambit from '@/components/CubeGambit'
import styles from './main.module.css'

const SEASONS = [
  { id: 1, name: 'PG: Simply',       Cube: CubeSimply, glowColor: 'rgba(0,252,237,0.35)' },
  { id: 2, name: 'PG: Zero',         Cube: CubeZero,   glowColor: 'rgba(200,200,200,0.25)' },
  { id: 3, name: 'PG: Puzzle Gambit',Cube: CubeGambit, glowColor: 'rgba(176,38,255,0.35)' },
]

const BADGE_MAP: Record<Role, { label: string; cls: string }> = {
  admin:  { label: 'Админ',    cls: styles.badgeAdmin },
  player: { label: 'Игрок',   cls: styles.badgePlayer },
  viewer: { label: 'Зритель', cls: styles.badgeViewer },
}

interface Props {
  username: string
  role: Role
}

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
          {SEASONS.map(({ id, name, Cube, glowColor }) => (
            <a key={id} href="#" className={styles.seasonCard} style={{ '--glow': glowColor } as React.CSSProperties}>
              <div className={styles.cubeWrap}>
                <Cube />
              </div>
              <div className={styles.seasonName}>{name}</div>
            </a>
          ))}
        </div>
      </main>
    </>
  )
}
