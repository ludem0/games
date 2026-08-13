'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { UtView, UtRound, Mark } from '@/lib/ultimate'
import RulesCard from '@/components/RulesCard'
import { ULTIMATE_RULES } from './rules'
import styles from './ultimate.module.css'

const POLL_MS = 2000
const MAX_GAMES = 3

interface Props {
  slug: string
  initialView: UtView
  username: string
  role: Role
  roster: string[]
  psigems: Record<string, number>
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, deadline - now)
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span className={left < 30000 ? styles.clockLow : styles.clock}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

function Board({
  round, legal, onPlay,
}: {
  round: UtRound
  legal: number[]
  onPlay: (cell: number) => void
}) {
  const playable = new Set(legal)
  const lastCell = round.moves[round.moves.length - 1]?.cell ?? -1

  return (
    <div className={styles.global}>
      {Array.from({ length: 9 }, (_, board) => {
        const result = round.boards[board]
        const isActive = round.activeBoard === board && !round.finishedAt
        const cls = [
          styles.local,
          isActive ? styles.localActive : '',
          result ? styles.localClosed : '',
        ].filter(Boolean).join(' ')

        return (
          <div key={board} className={cls}>
            {Array.from({ length: 9 }, (_, pos) => {
              const cell = board * 9 + pos
              const mark = round.cells[cell]
              const canPlay = playable.has(cell)
              const cellCls = [
                styles.cell,
                canPlay ? styles.cellPlayable : '',
                mark === 'X' ? styles.markX : mark === 'O' ? styles.markO : '',
                cell === lastCell ? styles.cellLast : '',
              ].filter(Boolean).join(' ')

              return (
                <button key={cell} className={cellCls} disabled={!canPlay} onClick={() => onPlay(cell)}>
                  {mark ?? ''}
                </button>
              )
            })}
            {result && (
              <div className={`${styles.stamp} ${result === 'draw' ? styles.stampDraw : result === 'X' ? styles.markX : styles.markO}`}>
                {result === 'draw' ? 'ничья' : result}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function UltimateClient({ slug, initialView, username, role, roster, psigems }: Props) {
  const [view, setView] = useState<UtView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [starter, setStarter] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/ultimate/${slug}`)
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
    const res = await fetch(`/api/ultimate/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: UtView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as UtView)
    return true
  }

  const round = view.rounds[view.rounds.length - 1] ?? null
  const myTurn = view.turn === username && !!round && !round.finishedAt
  const rival = view.isDuelist ? (username === view.ec ? view.opponent : view.ec) : null
  const duel = [view.ec, view.opponent].filter((p): p is string => !!p)

  const markOf = (p: string): Mark | null => (round ? (p === round.starter ? 'X' : 'O') : null)

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
            {view.phase === 'setup' && 'Настройка'}
            {view.phase === 'live' && `Игра ${round?.number ?? 1} из ${MAX_GAMES}`}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          {view.ec && view.opponent && (
            <span className={styles.roles}>
              Кандидат на выбывание: <strong>{view.ec}</strong> · Оппонент: <strong>{view.opponent}</strong>
            </span>
          )}
          {view.deadline && view.deadlineFor && (
            <span className={styles.deadline}>
              Ход за {view.deadlineFor}: <Countdown deadline={view.deadline} />
            </span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа в DM: <strong>{view.winner}</strong></div>
        )}

        {/* admin setup */}
        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Роли и первый ход</div>
            <div className={styles.row}>
              <select className={styles.input} value={ec} onChange={e => setEc(e.target.value)}>
                <option value="">Кандидат на выбывание (EC)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (выбран EC)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={starter} onChange={e => setStarter(e.target.value)}>
                <option value="">Кто ходит первым (X)</option>
                {[ec, opponent].filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btn} disabled={busy}
                onClick={() => act('roles', { ec, opponent, starter: starter || undefined })}>
                Назначить
              </button>
            </div>
            <p className={styles.hint}>
              Псигемы: {[ec, opponent].filter(Boolean).map(p => `${p} — ${psigems[p] ?? 0}`).join(' · ') || 'выберите игроков'}.
              Если у оппонента их не меньше, чем у EC, стартового выбирает он; иначе кидайте deadlock coin.
              Во второй игре первым ходит другой, в третьей — снова этот.
            </p>
            <button className={styles.btnPrimary} disabled={busy || !view.ec || !view.opponent}
              onClick={() => act('start')}>
              Начать игру 1
            </button>
          </div>
        )}

        {/* the board */}
        {round && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Игра {round.number}: {round.starter} играет X
              {round.winner && ` · победил ${round.winner}`}
              {!round.winner && round.finishedAt && ' · без линии'}
            </div>
            <Board
              round={round}
              legal={myTurn ? view.legalCells : []}
              onPlay={cell => act('move', { cell })}
            />
            <div className={styles.legend}>
              {duel.map(p => (
                <span key={p}>
                  <strong className={markOf(p) === 'X' ? styles.markX : styles.markO}>{markOf(p)}</strong> {p}
                  {' · резерв '}
                  {Math.floor((view.reserveMs[p] ?? 0) / 60000)}:
                  {String(Math.floor(((view.reserveMs[p] ?? 0) % 60000) / 1000)).padStart(2, '0')}
                </span>
              ))}
            </div>
            {myTurn && (
              <p className={styles.hint}>
                {round.activeBoard == null
                  ? 'Вас отправили в закрытую доску: ходите в любую открытую клетку.'
                  : `Ходите в доску ${round.activeBoard + 1} (подсвечена).`}
                {round.moves.length === 0 && ' Первым ходом нельзя занять центр центральной доски.'}
              </p>
            )}
            {view.isDuelist && !myTurn && !round.finishedAt && (
              <p className={styles.waiting}>Ход соперника{rival ? ` (${rival})` : ''}…</p>
            )}
          </div>
        )}

        {/* series state */}
        {view.rounds.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Серия</div>
            <div className={styles.games}>
              {view.rounds.map(r => (
                <span key={r.number} className={styles.gameChip}>
                  Игра {r.number}: {r.winner ? `победа ${r.winner}` : r.finishedAt ? 'без линии' : 'идёт'}
                </span>
              ))}
            </div>
            <div className={styles.tally}>
              {duel.map(p => (
                <span key={p}>Локальных досок у {p}: <strong>{view.boardsWon[p] ?? 0}</strong></span>
              ))}
            </div>
            <p className={styles.hint}>
              Линия на глобальной доске заканчивает DM сразу. Если её нет за три игры, выигрывает тот,
              кто взял больше локальных досок суммарно; при равенстве — оппонент. Кончилось время — поражение в DM.
            </p>
          </div>
        )}

        {/* admin tools */}
        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <div className={styles.row}>
              {view.awaitingNextGame && (
                <button className={styles.btnPrimary} disabled={busy} onClick={() => act('nextgame')}>
                  Начать игру {view.rounds.length + 1}
                </button>
              )}
              <button className={styles.btnDanger} disabled={busy}
                onClick={() => { if (confirm('Сбросить весь DM?')) act('reset') }}>
                Начать заново
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={ULTIMATE_RULES} />

        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход игры</div>
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
