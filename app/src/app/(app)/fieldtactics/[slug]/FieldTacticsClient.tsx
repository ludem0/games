'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { FtView, PieceKind } from '@/lib/fieldTactics'
import RulesCard from '@/components/RulesCard'
import { FIELD_TACTICS_RULES } from './rules'
import styles from './field.module.css'

const POLL_MS = 2000
const COLS = 6
const ROWS = 8
const BRIDGES = [19, 22, 25, 28]      // B4, E4, B5, E5

const SHORT: Record<PieceKind, string> = {
  G3: '★★★', G2: '★★', G1: '★',
  F3: '///', F2: '//', F1: '/',
  C3: '^^^', C2: '^^', C1: '^',
  plane: '✈', tank: '🚗', cavalry: '🐴', engineer: '🔧', spy: '🔍', mine: '💣', flag: '⚑',
}

interface Props {
  slug: string
  initialView: FtView
  username: string
  role: Role
  roster: string[]
}

const squareName = (index: number) =>
  `${String.fromCharCode(65 + (index % COLS))}${Math.floor(index / COLS) + 1}`

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

export default function FieldTacticsClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<FtView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [layout, setLayout] = useState<Record<string, number>>({})
  const [holding, setHolding] = useState<string | null>(null)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/fieldtactics/${slug}`)
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
    const res = await fetch(`/api/fieldtactics/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: FtView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as FtView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live'
  const placing = view.phase === 'placing' && view.isDuelist && !view.placed[username]
  const myMoves = selected != null
    ? (view.moves[view.board[selected]?.id ?? ''] ?? [])
    : []

  function clickSquare(square: number) {
    if (placing) {
      if (!holding) return
      setLayout(l => {
        const next = Object.fromEntries(Object.entries(l).filter(([, s]) => s !== square))
        return { ...next, [holding]: square }
      })
      setHolding(null)
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

  // during placement the tray holds whatever has not been put down yet
  const trayPieces = view.isDuelist && view.phase === 'placing'
    ? (view.myPieces.length > 0 ? view.myPieces.map(p => ({ id: p.id, kind: p.kind })) : ARMY_TRAY(view.mySide))
    : []

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
            {view.phase === 'live' && (myTurn ? 'Ваш ход' : `Ход ${view.turn}`)}
            {view.phase === 'tiebreak' && 'Дуэль'}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            Красные: подвижных {view.counts.red.movable}, лидеров {view.counts.red.leaders} · Синие:
            подвижных {view.counts.blue.movable}, лидеров {view.counts.blue.leaders}
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
                <option value="">Кандидат на выбывание (синие)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (красные)</option>
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
            <div className={styles.cardTitle}>Поле</div>
            <div className={styles.field}>
              {Array.from({ length: COLS * ROWS }, (_, i) => {
                // rows are drawn from eight down to one so both sides read naturally
                const row = ROWS - 1 - Math.floor(i / COLS)
                const col = i % COLS
                const square = row * COLS + col
                const cell = view.board[square]
                const placedHere = Object.entries(layout).find(([, s]) => s === square)
                const isTarget = myMoves.includes(square)
                const classes = [
                  styles.cell,
                  square === 2 || square === 3 ? styles.redBase : '',
                  square === 44 || square === 45 ? styles.blueBase : '',
                  row === 4 ? styles.riverEdgeBottom : '',
                  row === 3 ? styles.riverEdgeTop : '',
                  BRIDGES.includes(square) ? styles.bridge : '',
                  cell?.side === 'red' ? styles.red : cell?.side === 'blue' ? styles.blue : '',
                  isTarget ? styles.target : '',
                  selected === square ? styles.chosen : '',
                  (placing && holding) || (myTurn && cell?.id) ? styles.selectable : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={square} className={classes} title={squareName(square)}
                    onClick={() => clickSquare(square)}>
                    {cell?.kind ? SHORT[cell.kind] : cell?.side ? '?' : placedHere ? SHORT[pieceKindOf(placedHere[0])] : squareName(square)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {placing && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Расставьте 23 фигуры на своей половине</div>
            <div className={styles.tray}>
              {ARMY_TRAY(view.mySide).map(piece => (
                <button key={piece.id}
                  className={`${styles.trayPiece} ${holding === piece.id ? styles.trayChosen : ''} ${layout[piece.id] != null ? styles.trayPlaced : ''}`}
                  onClick={() => setHolding(piece.id)}>
                  {SHORT[piece.kind]}{layout[piece.id] != null && ` ${squareName(layout[piece.id])}`}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              Выберите фигуру, затем клетку на своей половине. Обе клетки базы должны быть заняты,
              мины и флаг нельзя ставить на B4, E4, B5 и E5. Расставлено: {Object.keys(layout).length} из 23.
            </p>
            <button className={styles.btnPrimary} disabled={busy || Object.keys(layout).length !== 23}
              onClick={() => act('place', { layout })}>
              Подтвердить расстановку
            </button>
          </div>
        )}

        {view.phase === 'tiebreak' && view.tiebreakWaiting && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Дуэль: выберите фигуру</div>
            <div className={styles.tray}>
              {view.myPieces.filter(p => p.alive && p.kind !== 'mine' && p.kind !== 'flag').map(piece => (
                <button key={piece.id} className={styles.trayPiece} disabled={busy}
                  onClick={() => act('duel', { pieceId: piece.id })}>
                  {SHORT[piece.kind]} {squareName(piece.square)}
                </button>
              ))}
            </div>
          </div>
        )}

        {isAdmin && view.phase === 'placing' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <p className={styles.hint}>
              Расстановку сдали: {Object.keys(view.placed).join(', ') || 'никто'}
            </p>
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

        <RulesCard sections={FIELD_TACTICS_RULES} />

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

/** The pieces an army starts with, mirrored from the engine for the tray. */
const ARMY: [PieceKind, number][] = [
  ['G3', 1], ['G2', 1], ['G1', 1], ['F3', 1], ['F2', 1], ['F1', 1],
  ['C3', 2], ['C2', 2], ['C1', 2], ['plane', 2], ['tank', 2],
  ['cavalry', 1], ['engineer', 2], ['spy', 1], ['mine', 2], ['flag', 1],
]

function ARMY_TRAY(side: FtView['mySide']): { id: string; kind: PieceKind }[] {
  const colour = side ?? 'red'
  return ARMY.flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, i) => ({ id: `${colour}-${kind}-${i}`, kind })))
}

function pieceKindOf(id: string): PieceKind {
  return id.split('-')[1] as PieceKind
}
