'use client'

import { useState } from 'react'
import type { MinigameData, MinecartRound, RoundLayout } from '@/lib/minigames'
import type { Role } from '@/lib/types'
import styles from './minigame.module.css'

interface Props {
  game: MinigameData
  role: Role
  username: string
}

// one colour per route letter, so a path is recognisable across the table
const ROUTE_COLORS = ['#f59e0b', '#facc15', '#84cc16', '#f87171', '#38bdf8', '#c084fc', '#fb923c', '#2dd4bf']

interface Route { letter: string; color: string }

function routesOf(layout: RoundLayout): { byTrack: Record<string, Route>; byChain: Record<string, Route> } {
  const byTrack: Record<string, Route> = {}
  const byChain: Record<string, Route> = {}
  let i = 0
  for (const t of layout.tracks) {
    if (t.isFloating || t.isSpacer) continue
    const route = { letter: String.fromCharCode(65 + i), color: ROUTE_COLORS[i % ROUTE_COLORS.length] }
    byTrack[t.id] = route
    for (const c of t.chains) byChain[c.id] = route
    i++
  }
  return { byTrack, byChain }
}

interface Cell { text: string; color: string | null }

function actionCell(round: MinecartRound, crossing: 1 | 2, username: string): Cell {
  const sub = round.submissions.find(s => s.username === username && s.crossingNumber === crossing)
  if (!sub || sub.action.type === 'stay') return { text: 'Нет действия', color: null }

  if (sub.action.type === 'board') {
    const route = routesOf(round.layout).byChain[sub.action.chainId]
    return { text: route ? `Путь ${route.letter}` : 'Вагонетка', color: route?.color ?? null }
  }

  const sw = round.layout.switches.find(s => s.id === (sub.action as { switchId: string }).switchId)
  return { text: 'Рычаг', color: sw?.color ?? null }
}

export default function ResultsSection({ game, role, username }: Props) {
  const [distributing, setDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<null | Record<string, unknown>>(null)

  const played = game.rounds.filter(r => r.results.length > 0)
  const standings = [...game.participants].sort((a, b) => (game.totalPoints[b] ?? 0) - (game.totalPoints[a] ?? 0))
  const bestScore = game.totalPoints[standings[0]] ?? 0
  const worstScore = game.totalPoints[standings[standings.length - 1]] ?? 0

  async function handleDistribute() {
    if (!confirm('Распределить финальные награды? Это действие необратимо.')) return
    setDistributing(true)
    const res = await fetch(`/api/minigames/${game.id}/distribute`, { method: 'POST' })
    setDistributeResult(await res.json())
    setDistributing(false)
  }

  return (
    <div className={styles.resultsWrap}>
      {played.length === 0 && <div className={styles.noData}>Раунды ещё не сыграны</div>}

      {played.map(round => {
        const c1 = round.results.find(r => r.crossingNumber === 1)
        const c2 = round.results.find(r => r.crossingNumber === 2)
        return (
          <div key={round.roundNumber} className={styles.resTableWrap}>
            <table className={styles.resTable}>
              <thead>
                <tr>
                  <th className={styles.resCorner} />
                  <th colSpan={2}>Пересечение 1</th>
                  <th colSpan={2}>{c2 ? 'Пересечение 2' : 'Пересечение 2 (идёт)'}</th>
                  <th rowSpan={2} className={styles.resTotalHead}>Итого</th>
                </tr>
                <tr>
                  <th className={styles.resPlayerHead}>Раунд {round.roundNumber}</th>
                  <th>Действие</th>
                  <th className={styles.resScoreHead}>Очки</th>
                  <th>Действие</th>
                  <th className={styles.resScoreHead}>Очки</th>
                </tr>
              </thead>
              <tbody>
                {game.participants.map(p => {
                  const a1 = actionCell(round, 1, p)
                  const a2 = c2 ? actionCell(round, 2, p) : { text: '', color: null }
                  const s1 = c1?.pointsAwarded[p] ?? 0
                  const s2 = c2?.pointsAwarded[p] ?? 0
                  return (
                    <tr key={p} className={p === username ? styles.resSelfRow : undefined}>
                      <td className={styles.resPlayer}>{p}</td>
                      <td className={styles.resAction} style={a1.color ? { background: a1.color, color: '#111' } : undefined}>{a1.text}</td>
                      <td className={styles.resScore}>{s1}</td>
                      <td className={styles.resAction} style={a2.color ? { background: a2.color, color: '#111' } : undefined}>{a2.text}</td>
                      <td className={styles.resScore}>{s2}</td>
                      <td className={styles.resTotal}>{s1 + s2}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className={styles.resTableWrap}>
        <table className={`${styles.resTable} ${styles.resFinal}`}>
          <thead>
            <tr>
              <th className={styles.resPlayerHead}>Итоговый счёт</th>
              <th className={styles.resScoreHead}>Очки</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(p => {
              const pts = game.totalPoints[p] ?? 0
              const cls = pts === bestScore ? styles.resBest : pts === worstScore ? styles.resWorst : undefined
              return (
                <tr key={p} className={p === username ? styles.resSelfRow : undefined}>
                  <td className={`${styles.resPlayer} ${cls ?? ''}`}>{p}</td>
                  <td className={`${styles.resScore} ${cls ?? ''}`}>{pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
            <p>🏆 Единственный победитель: <strong>{distributeResult.soleWinner as string}</strong>, 2 жетона неуязвимости и опал</p>
          )}
          {(distributeResult.topPlayers as string[]).length > 1 && (
            <p>🥇 Победители: {(distributeResult.topPlayers as string[]).join(', ')}</p>
          )}
          <p>☠️ Кандидат на выбывание: {(distributeResult.eliminationCandidates as string[]).join(', ')}</p>
          {distributeResult.opalChallengeFailed ? (
            <p>💎 Opal Challenge провален: одинаково близки к среднему {(distributeResult.averagePoints as number)} оказались {(distributeResult.closestToAverage as string[]).join(', ')}</p>
          ) : (
            <p>💎 Opal Challenge: <strong>{distributeResult.opalWinner as string}</strong>, ближе всех к среднему {(distributeResult.averagePoints as number)}</p>
          )}
          <p>Псигемы за топ-3 и за очки начислены в сезон.</p>
        </div>
      )}
    </div>
  )
}
