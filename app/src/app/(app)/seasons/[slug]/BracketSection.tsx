'use client'

import type { Round } from '@/lib/seasons'
import styles from './bracket.module.css'

interface Props {
  rounds: Round[]
  participants: string[]
}

/**
 * The season at a glance: a vertical timeline of rounds showing who fell where,
 * built entirely from data the rounds already carry.
 */
export default function BracketSection({ rounds, participants }: Props) {
  if (rounds.length === 0) return null

  // walk the rounds and mark when each player left the season
  const droppedAt = new Map<string, number>()
  rounds.forEach((round, i) => {
    const dms = round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
    for (const dm of dms) {
      if (dm.eliminated) droppedAt.set(dm.eliminated, i)
    }
  })

  const finalRound = rounds.find(r => r.type === 'final')
  const champion = finalRound?.mainMatch.winners[0] ?? null
  const alive = participants.filter(p => !droppedAt.has(p))

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Путь сезона</h2>

      <div className={styles.timeline}>
        {rounds.map((round, i) => {
          const dms = round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
          const isFinal = round.type === 'final'
          return (
            <div key={round.id} className={styles.round}>
              <div className={styles.marker}>
                <span className={isFinal ? styles.dotFinal : styles.dot} />
                {i < rounds.length - 1 && <span className={styles.line} />}
              </div>
              <div className={styles.body}>
                <div className={styles.roundName}>
                  {isFinal ? 'Финал' : `Раунд ${round.number}`}
                </div>

                <div className={styles.match}>
                  <span className={styles.mmTag}>MM</span>
                  <span className={styles.matchName}>{round.mainMatch.name}</span>
                </div>
                {round.mainMatch.winners.length > 0 && (
                  <div className={styles.row}>
                    <span className={styles.win}>🏆 {round.mainMatch.winners.join(', ')}</span>
                    {round.mainMatch.losers.length > 0 && (
                      <span className={styles.lose}>→ в дэтматч: {round.mainMatch.losers.join(', ')}</span>
                    )}
                  </div>
                )}

                {dms.map((dm, j) => (
                  <div key={j}>
                    <div className={styles.match}>
                      <span className={styles.dmTag}>DM</span>
                      <span className={styles.matchName}>{dm.name}</span>
                    </div>
                    {dm.winner && (
                      <div className={styles.row}>
                        <span className={styles.win}>выжил {dm.winner}</span>
                        {dm.eliminated && <span className={styles.out}>✝ {dm.eliminated}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        {champion ? (
          <span className={styles.champion}>Чемпион: {champion}</span>
        ) : (
          <span className={styles.aliveLabel}>В игре: {alive.length ? alive.join(', ') : '—'}</span>
        )}
        {droppedAt.size > 0 && (
          <span className={styles.fallen}>
            Выбыли: {[...droppedAt.entries()]
              .sort((a, b) => a[1] - b[1])
              .map(([p]) => p)
              .join(' → ')}
          </span>
        )}
      </div>
    </section>
  )
}
