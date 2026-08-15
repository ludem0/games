'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { PscView } from '@/lib/puzzleChambers'
import { BOARD, COLUMNS } from '@/lib/chambersBoard'
import RulesCard from '@/components/RulesCard'
import { CHAMBERS_RULES } from './rules'
import styles from './chambers.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 2000

interface Props {
  slug: string
  initialView: PscView
  username: string
  role: Role
  roster: string[]
}


export default function ChambersClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<PscView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [first, setFirst] = useState('')
  const [puzzleJson, setPuzzleJson] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/puzzlechambers/${slug}`)
    if (res.ok) setView(await res.json())
  }, [slug])

  useEffect(() => {
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }) }, [view.log.length])

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/puzzlechambers/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: PscView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as PscView)
    return true
  }

  const amActive = view.active === username
  const byNumber = Object.fromEntries(view.board.map(square => [square.number, square]))

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navTitle}>{view.name}</div>
        <div className={styles.navUser}>{username}</div>
      </nav>

      <main className={styles.content}>
        <div className={styles.statusRow}>
          <span className={styles.phaseTag}>
            {view.phase === 'setup' && 'Подготовка'}
            {view.phase === 'picking' && `Выбирает ${view.active}`}
            {view.phase === 'solving' && 'Решаем'}
            {view.phase === 'placing' && `${view.active} ставит число`}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          {view.deadline && view.phase !== 'finished' && (
            <span className={styles.deadline}>Осталось: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner}</strong></div>
        )}

        {view.players.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Башни</div>
            <div className={styles.towers}>
              {view.players.map(player => (
                <div key={player}
                  className={`${styles.tower} ${player === view.active ? styles.towerActive : ''}`}>
                  <div className={styles.towerName}>
                    {player}{view.reachedOpal.includes(player) && ' · был на 200'}
                  </div>
                  <div className={styles.towerValue}>{view.towers[player] ?? 0}</div>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: `${((view.towers[player] ?? 0) / 200) * 100}%` }} />
                  </div>
                  <div className={styles.towerName}>
                    псигемов за матч: {view.earned[player] ?? 0}
                  </div>
                </div>
              ))}
            </div>
            {view.phase === 'placing' && amActive && view.current && (
              <div className={styles.row}>
                <span>Число {view.current.number} идёт в башню:</span>
                {view.players.map(player => (
                  <span key={player} className={styles.row}>
                    <button className={styles.btn} disabled={busy}
                      onClick={() => act('place', { tower: player, add: true })}>
                      {player} +
                    </button>
                    <button className={styles.btn} disabled={busy}
                      onClick={() => act('place', { tower: player, add: false })}>
                      {player} −
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {view.phase === 'solving' && view.current && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Задача {view.current.number} · {view.current.type}
            </div>
            <p>{view.current.question || 'Задача опубликована ведущим отдельно.'}</p>
            {view.amPlayer && (view.myGuess ? (
              <p className={styles.hint}>
                Ваш ответ: «{view.myGuess.text}» — {view.myGuess.correct ? 'верно' : 'неверно'}
              </p>
            ) : (
              <form className={styles.row} onSubmit={e => {
                e.preventDefault()
                if (answer.trim()) act('guess', { text: answer }).then(() => setAnswer(''))
              }}>
                <input className={styles.input} value={answer} placeholder="Одна попытка"
                  onChange={e => setAnswer(e.target.value)} />
                <button className={styles.btnPrimary} type="submit" disabled={busy || !answer.trim()}>
                  Ответить
                </button>
              </form>
            ))}
            <p className={styles.hint}>Ответили: {view.guessed.join(', ') || 'пока никто'}</p>
          </div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Доска задач</div>
            <div className={styles.boardWrap}>
              <div className={styles.board}>
                {BOARD.map((number, index) => {
                  if (number == null) {
                    return <div key={index} className={`${styles.square} ${styles.grey}`} />
                  }
                  const square = byNumber[number]
                  const openNow = view.phase === 'picking' && amActive && square?.open
                  const cls = [
                    styles.square,
                    square?.attempted ? styles.done : styles.live,
                    openNow ? styles.open : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button key={index} className={cls} disabled={busy || !openNow}
                      title={`${number} · ${square?.type}${square?.solvedBy ? ` · решил ${square.solvedBy}` : ''}`}
                      onClick={() => act('pick', { number })}>
                      {number}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className={styles.hint}>
              Открыты для выбора те номера, что граничат с серой клеткой. Колонок на доске {COLUMNS}.
            </p>
          </div>
        )}

        {view.phase === 'finished' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итог</div>
            <div className={styles.counts}>
              {view.standings.map((row, i) => (
                <span key={row.player}>
                  {i + 1}. {row.player}: {row.total} Ψ (за матч {row.earned >= 0 ? '+' : ''}{row.earned})
                </span>
              ))}
            </div>
            <p className={styles.hint}>
              В дэтматч идут: {view.standings.slice(1).map(r => r.player).join(', ')}
            </p>
          </div>
        )}

        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Подготовка</div>
            <p className={styles.hint}>
              Загрузите 50 задач одним JSON: [&#123;&quot;number&quot;:0,&quot;question&quot;:&quot;…&quot;,&quot;answer&quot;:&quot;…&quot;&#125;, …].
              Поле type необязательно, по умолчанию по пять задач каждого из десяти видов.
            </p>
            <textarea className={styles.input} rows={5} value={puzzleJson}
              onChange={e => setPuzzleJson(e.target.value)} />
            <div className={styles.row}>
              <button className={styles.btn} disabled={busy || !puzzleJson.trim()}
                onClick={() => {
                  try {
                    act('puzzles', { puzzles: JSON.parse(puzzleJson) })
                  } catch {
                    setError('JSON не разобрался')
                  }
                }}>
                Загрузить задачи
              </button>
            </div>
            <div className={styles.row}>
              {roster.map(player => (
                <button key={player}
                  className={`${styles.btn} ${picked.includes(player) ? styles.toggle : ''}`}
                  onClick={() => setPicked(p =>
                    p.includes(player) ? p.filter(x => x !== player) : [...p, player].slice(-3))}>
                  {player}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <select className={styles.input} value={first} onChange={e => setFirst(e.target.value)}>
                <option value="">Кто выбирает первым</option>
                {picked.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btnPrimary} disabled={busy || picked.length !== 3}
                onClick={() => act('start', { players: picked, first })}>
                Начать матч
              </button>
            </div>
            <p className={styles.hint}>Выбрано игроков: {picked.join(', ') || 'никого'}. Первым выбирает победитель прошлого дэтматча.</p>
          </div>
        )}

        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить весь матч?')) act('reset') }}>
              Сбросить матч
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={CHAMBERS_RULES} />

        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход матча</div>
          <div className={styles.log}>
            {view.log.length === 0 && <p className={styles.hint}>Пусто</p>}
            {view.log.map((e, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logTime}>
                  {new Date(e.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>{e.text}</span>
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </div>
      </main>
    </div>
  )
}
