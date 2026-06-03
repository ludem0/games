'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MinigameData } from '@/lib/minigames'
import type { Role } from '@/lib/types'
import OverviewSection from './OverviewSection'
import RoundsSection from './RoundsSection'
import LeaderboardSection from './LeaderboardSection'
import RulesTab from './RulesTab'
import styles from './minigame.module.css'

type Tab = 'overview' | 'rounds' | 'leaderboard' | 'rules'

interface Props {
  game: MinigameData
  username: string
  role: Role
}

export default function TrackTroubleClient({ game: initialGame, username, role }: Props) {
  const [tab, setTab] = useState<Tab>('rounds')
  const [game, setGame] = useState(initialGame)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rounds', label: 'Раунды' },
    { id: 'overview', label: 'Обзор' },
    { id: 'leaderboard', label: 'Рейтинг' },
    { id: 'rules', label: 'Правила' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.bgLayer} aria-hidden />

      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navTitle}>{game.name}</div>
        <div className={styles.navUser}>{username}</div>
      </nav>

      <div className={styles.tabs}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'overview' && (
          <OverviewSection game={game} role={role} username={username} onUpdate={setGame} />
        )}
        {tab === 'rounds' && (
          <RoundsSection game={game} role={role} username={username} onUpdate={setGame} />
        )}
        {tab === 'leaderboard' && (
          <LeaderboardSection gameSlug={game.id} participants={game.participants} />
        )}
        {tab === 'rules' && <RulesTab />}
      </div>
    </div>
  )
}
