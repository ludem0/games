'use client'

import type { CrossingResult, MinecartRound } from '@/lib/minigames'
import styles from './minigame.module.css'

interface Props {
  result: CrossingResult
  round: MinecartRound
}

export default function ResultPanel({ result, round }: Props) {
  const departed = result.departedChainIds.length > 0

  // build a label for each chain that departed
  const chainLabels: Record<string, string> = {}
  for (const track of round.layout.tracks) {
    for (const chain of track.chains) {
      chainLabels[chain.id] = chain.destination
    }
  }

  return (
    <div className={styles.resultWrap}>
      <div className={styles.resultTitle}>
        Итоги пересечения {result.crossingNumber}
      </div>

      {result.activatedSwitchIds.length > 0 && (
        <div className={styles.resultSection}>
          <div className={styles.resultLabel}>⚡ Переключатели активированы</div>
          {result.activatedSwitchIds.map(id => (
            <span key={id} className={styles.resultTag}>{id}</span>
          ))}
        </div>
      )}

      {departed ? (
        <div className={styles.resultSection}>
          <div className={styles.resultLabel}>🚃 Отправившиеся цепи</div>
          {result.departedChainIds.map(id => (
            <span key={id} className={styles.resultTagGreen}>{chainLabels[id] ?? id}</span>
          ))}
        </div>
      ) : (
        <div className={styles.resultNone}>Ни одна вагонетка не отправилась</div>
      )}

      <div className={styles.resultSection}>
        <div className={styles.resultLabel}>Очки за пересечение</div>
        <div className={styles.resultPointsList}>
          {Object.entries(result.pointsAwarded).sort(([, a], [, b]) => b - a).map(([username, pts]) => (
            <div key={username} className={styles.resultPointRow}>
              <span className={styles.resultPointUser}>{username}</span>
              <span className={styles.resultPointPts} style={{ color: pts > 0 ? 'var(--neon)' : '#666' }}>
                {pts > 0 ? `+${pts}` : '0'}
              </span>
              {result.psigemGrants[username] && (
                <span className={styles.resultPsigemGrant}>+{result.psigemGrants[username]} Ψ</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.resultSection}>
        <div className={styles.resultLabel}>Позиции после пересечения</div>
        <div className={styles.resultPositions}>
          {Object.entries(result.playerPositions).map(([username, side]) => (
            <div key={username} className={styles.resultPosRow}>
              <span>{username}</span>
              <span className={styles.resultPosSide}>{side === 'north' ? '🏔 Север' : '⛏ Юг'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
