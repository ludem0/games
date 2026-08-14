'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { NjView } from '@/lib/numberJanggi'
import RulesCard from '@/components/RulesCard'
import { JANGGI_RULES } from './rules'
import styles from './janggi.module.css'

const POLL_MS = 2000
const COLS = 6
const ROWS = 9

interface Props {
  slug: string
  initialView: NjView
  username: string
  role: Role
  roster: string[]
}

const squareName = (index: number) =>
  `${String.fromCharCode(65 + (index % COLS))}${Math.floor(index / COLS) + 1}`

/** The fourteen pieces of an army, mirrored for the placement tray. */
function armyTray(side: 'red' | 'blue') {
  const pieces: { id: string; label: string }[] = []
  for (let value = 1; value <= 10; value++) pieces.push({ id: `${side}-s${value}`, label: String(value) })
  for (let i = 0; i < 3; i++) pieces.push({ id: `${side}-bomb${i}`, label: '☢' })
  pieces.push({ id: `${side}-king`, label: '👑' })
  return pieces
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

export default function JanggiClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<NjView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [layout, setLayout] = useState<Record<string, number>>({})
  const [holding, setHolding] = useState<string | null>(null)
  const [returning, setReturning] = useState<string | null>(null)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/numberjanggi/${slug}`)
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
    const res = await fetch(`/api/numberjanggi/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: NjView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as NjView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live' && !view.reinforcing
  const placing = view.phase === 'placing' && view.isDuelist && !view.placed[username]
  const myMoves = selected != null ? (view.moves[view.board[selected]?.id ?? ''] ?? []) : []
  const homeRows = view.mySide === 'blue' ? [6, 7, 8] : [0, 1, 2]

  function clickSquare(square: number) {
    if (placing) {
      if (!holding || !homeRows.includes(Math.floor(square / COLS))) return
      setLayout(l => {
        const next = Object.fromEntries(Object.entries(l).filter(([, s]) => s !== square))
        return { ...next, [holding]: square }
      })
      setHolding(null)
      return
    }
    if (view.reinforcing === username && returning) {
      if (!view.returnSquares.includes(square)) return
      act('return', { pieceId: returning, square }).then(() => setReturning(null))
      return
    }
    if (!myTurn) return
    if (selected != null && myMoves.includes(square)) {
      act('move', { from: selected, to: square }).then(() => setSelected(null))
      return
    }
    const cell = view.board[square]
    setSelected(cell?.id && view.moves[cell.id] ? square : null)
  }

  const label = (square: number): string => {
    const cell = view.board[square]
    if (cell?.kind === 'king') return '👑'
    if (cell?.kind === 'bomb') return '☢'
    if (cell?.value) return String(cell.value)
    if (cell?.side) return '?'
    const placedHere = Object.entries(layout).find(([, s]) => s === square)
    if (placedHere) return armyTray(view.mySide ?? 'red').find(p => p.id === placedHere[0])?.label ?? '?'
    return squareName(square)
  }

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
            {view.phase === 'placing' && 'Расстановка'}
            {view.phase === 'live' && (view.reinforcing ? 'Возврат фигуры' : myTurn ? 'Ваш ход' : `Ход ${view.turn}`)}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>Осталось: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner}</strong></div>
        )}

        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Игроки</div>
            <div className={styles.row}>
              <select className={styles.input} value={ec} onChange={e => setEc(e.target.value)}>
                <option value="">Кандидат на выбывание (низ доски)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (верх доски)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btnPrimary} disabled={busy}
                onClick={() => act('roles', { ec, opponent })}>
                Назначить и открыть расстановку
              </button>
            </div>
          </div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Доска</div>
            <div className={styles.field}>
              {Array.from({ length: COLS * ROWS }, (_, i) => {
                const row = ROWS - 1 - Math.floor(i / COLS)
                const col = i % COLS
                const square = row * COLS + col
                const cell = view.board[square]
                const classes = [
                  styles.cell,
                  row <= 2 ? styles.homeRed : row >= 6 ? styles.homeBlue : '',
                  col === 2 || col === 4 ? styles.barLeft : '',
                  cell?.side === 'red' ? styles.red : cell?.side === 'blue' ? styles.blue : '',
                  myMoves.includes(square) ? styles.target : '',
                  selected === square ? styles.chosen : '',
                  view.returnSquares.includes(square) && returning ? styles.target : '',
                  (placing && holding) || (myTurn && cell?.id) ? styles.selectable : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={square} className={classes} title={squareName(square)}
                    onClick={() => clickSquare(square)}>
                    {label(square)}
                  </div>
                )
              })}
            </div>
            <p className={styles.hint}>
              Красные полосы идут между колонками B и C, а также D и E: бой через них считается разностью.
            </p>
          </div>
        )}

        {placing && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Расставьте 14 фигур на своей территории</div>
            <div className={styles.tray}>
              {armyTray(view.mySide ?? 'red').map(piece => (
                <button key={piece.id}
                  className={`${styles.trayPiece} ${holding === piece.id ? styles.trayChosen : ''} ${layout[piece.id] != null ? styles.trayPlaced : ''}`}
                  onClick={() => setHolding(piece.id)}>
                  {piece.label}{layout[piece.id] != null && ` ${squareName(layout[piece.id])}`}
                </button>
              ))}
            </div>
            <p className={styles.hint}>Расставлено: {Object.keys(layout).length} из 14.</p>
            <button className={styles.btnPrimary} disabled={busy || Object.keys(layout).length !== 14}
              onClick={() => act('place', { layout })}>
              Подтвердить расстановку
            </button>
          </div>
        )}

        {view.reinforcing === username && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Верните павшего бойца</div>
            <div className={styles.tray}>
              {view.returnable.map(piece => (
                <button key={piece.id}
                  className={`${styles.trayPiece} ${returning === piece.id ? styles.trayChosen : ''}`}
                  onClick={() => setReturning(piece.id)}>
                  {piece.value}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              {returning ? 'Теперь укажите клетку своей задней линии.' : 'Выберите бойца, или откажитесь.'}
            </p>
            <button className={styles.btn} disabled={busy} onClick={() => act('skipreturn')}>
              Не возвращать
            </button>
          </div>
        )}

        {view.removed.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Снятые фигуры</div>
            <p className={styles.hint}>
              {view.removed.map((p, i) =>
                `${p.side === 'red' ? 'низ' : 'верх'} ${p.kind === 'king' ? '👑' : p.kind === 'bomb' ? '☢' : p.value}`
                + (i < view.removed.length - 1 ? ', ' : '')).join('')}
            </p>
          </div>
        )}

        {isAdmin && view.phase === 'placing' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <p className={styles.hint}>Расстановку сдали: {Object.keys(view.placed).join(', ') || 'никто'}</p>
            <div className={styles.row}>
              <select className={styles.input} value={first} onChange={e => setFirst(e.target.value)}>
                <option value="">Кто ходит первым</option>
                {[view.ec, view.opponent].filter(Boolean).map(p => <option key={p} value={p!}>{p}</option>)}
              </select>
              <button className={styles.btnPrimary} disabled={busy} onClick={() => act('start', { first })}>
                Начать игру
              </button>
            </div>
          </div>
        )}

        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить весь DM?')) act('reset') }}>
              Сбросить
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={JANGGI_RULES} />

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
