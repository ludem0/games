'use client'

import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/types'
import styles from './main.module.css'

const PLACEHOLDER_GAMES = [
  { icon: '🎲', title: 'Игра доверия', id: 1 },
  { icon: '🧠', title: 'Дилемма заключённого', id: 2 },
  { icon: '♟️', title: 'Психологические шахматы', id: 3 },
  { icon: '🃏', title: 'Игра лжи', id: 4 },
  { icon: '🎯', title: 'Ультиматум', id: 5 },
  { icon: '🔮', title: 'Предсказание', id: 6 },
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
        <div className={styles.navLogo}>GameZone</div>
        <div className={styles.navRight}>
          <div className={styles.userInfo}>
            <span className={styles.username}>{username}</span>
            <span className={`${styles.badge} ${badge.cls}`}>{badge.label}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </nav>

      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Добро пожаловать,<br />
          <span>{username}</span>
        </h1>
        <p className={styles.heroSub}>
          Психологические и азартные игры. Проверь своё мышление.
        </p>
      </section>

      <main className={styles.section}>
        <div className={styles.sectionTitle}>Игры</div>
        <div className={styles.grid}>
          {PLACEHOLDER_GAMES.map(game => (
            <div key={game.id} className={styles.card}>
              <div className={styles.cardIcon}>{game.icon}</div>
              <div className={styles.cardTitle}>{game.title}</div>
              <div className={styles.cardBadge}>Скоро</div>
            </div>
          ))}
        </div>
      </main>

      <footer className={styles.footer}>
        GameZone © 2025
      </footer>
    </>
  )
}
