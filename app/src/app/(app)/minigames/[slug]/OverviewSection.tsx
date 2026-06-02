'use client'

import { useState } from 'react'
import type { MinigameData } from '@/lib/minigames'
import type { Role } from '@/lib/types'
import styles from './minigame.module.css'

interface Props {
  game: MinigameData
  role: Role
  username: string
  onUpdate: (g: MinigameData) => void
}

const STATUS_LABELS: Record<string, string> = {
  setup: 'Настройка',
  active: 'Активна',
  finished: 'Завершена',
}

export default function OverviewSection({ game, role, username, onUpdate }: Props) {
  const [distributing, setDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<null | Record<string, unknown>>(null)

  const myPoints = game.totalPoints[username] ?? 0
  const myPsigems = game.psigemBalance[username] ?? 0

  const activeRound = game.rounds.find(r => r.phase === 'crossing1_open' || r.phase === 'crossing2_open')
  const completedRounds = game.rounds.filter(r => r.phase === 'complete').length

  async function handleDistribute() {
    if (!confirm('Распределить финальные награды? Это действие необратимо.')) return
    setDistributing(true)
    const res = await fetch(`/api/minigames/${game.id}/distribute`, { method: 'POST' })
    const data = await res.json()
    setDistributeResult(data)
    setDistributing(false)
  }

  return (
    <div className={styles.overviewWrap}>
      <div className={styles.overviewHero}>
        <div className={styles.overviewTitle}>{game.name}</div>
        <span className={`${styles.statusBadge} ${styles[`status_${game.status}`]}`}>
          {STATUS_LABELS[game.status]}
        </span>
      </div>

      <div className={styles.overviewStats}>
        <div className={styles.overviewStat}>
          <span className={styles.overviewStatVal}>{completedRounds} / 9</span>
          <span className={styles.overviewStatLbl}>Раундов</span>
        </div>
        <div className={styles.overviewStat}>
          <span className={styles.overviewStatVal}>{game.participants.length}</span>
          <span className={styles.overviewStatLbl}>Участников</span>
        </div>
        <div className={styles.overviewStat}>
          <span className={styles.overviewStatVal} style={{ color: 'var(--neon)' }}>{myPoints}</span>
          <span className={styles.overviewStatLbl}>Мои очки</span>
        </div>
        <div className={styles.overviewStat}>
          <span className={styles.overviewStatVal} style={{ color: '#a855f7' }}>Ψ {myPsigems}</span>
          <span className={styles.overviewStatLbl}>Псигемы (игра)</span>
        </div>
      </div>

      {activeRound && (
        <div className={styles.activeRoundBanner}>
          <span className={styles.activeDot} />
          Раунд {activeRound.roundNumber} — {activeRound.phase === 'crossing1_open' ? 'Пересечение 1' : 'Пересечение 2'} открыто
          {activeRound.phaseDeadline && (
            <span className={styles.deadlineTag}>
              до {new Date(activeRound.phaseDeadline).toLocaleString('ru-RU')}
            </span>
          )}
        </div>
      )}

      <div className={styles.participantsCard}>
        <div className={styles.cardLabel}>Участники</div>
        <div className={styles.participantsList}>
          {game.participants.map(p => (
            <div key={p} className={`${styles.participantRow} ${p === username ? styles.participantSelf : ''}`}>
              <span className={styles.participantName}>{p}</span>
              <span className={styles.participantPts}>{game.totalPoints[p] ?? 0} очков</span>
            </div>
          ))}
        </div>
      </div>

      {role === 'admin' && game.status === 'finished' && !game.rewardsDistributed && (
        <button className={styles.distributeBtn} onClick={handleDistribute} disabled={distributing}>
          {distributing ? 'Распределяю...' : '🏆 Распределить финальные награды'}
        </button>
      )}

      {distributeResult && (
        <div className={styles.distributeResult}>
          <div className={styles.cardLabel}>Итоги игры</div>
          {(distributeResult.soleWinner as string | null) && (
            <p>🏆 Единственный победитель: <strong>{distributeResult.soleWinner as string}</strong> — 2 жетона иммунитета + опал</p>
          )}
          {(distributeResult.topPlayers as string[]).length > 1 && (
            <p>🥇 Победители: {(distributeResult.topPlayers as string[]).join(', ')}</p>
          )}
          <p>☠️ Кандидат на выбывание: {(distributeResult.eliminationCandidates as string[]).join(', ')}</p>
          <p>💎 Опал-челлендж: <strong>{distributeResult.opalWinner as string}</strong> (ближе всех к среднему {distributeResult.averagePoints as number})</p>
          <p>Псигемы (топ-3 + игровые) начислены в сезон.</p>
        </div>
      )}
    </div>
  )
}
