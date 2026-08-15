'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { DbwView } from '@/lib/dominoBw'
import RulesCard from '@/components/RulesCard'
import { DOMINO_BW_RULES } from './rules'
import styles from './dominobw.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 2000
const COLUMNS = 9
const ROWS = 9

interface Props {
  slug: string
  initialView: DbwView
  username: string
  role: Role
  roster: string[]
}

/** The bowl: full top row, body from B to H, floor from C to G. */
function isCell(col: number, row: number): boolean {
  if (row === 0) return true
  if (row === ROWS - 1) return col >= 2 && col <= 6
  return col >= 1 && col <= 7
}

const cellName = (col: number, row: number) =>
  `${String.fromCharCode(65 + col)}${String.fromCharCode(82 + row)}`


export default function DominoBwClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<DbwView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [domino, setDomino] = useState('')
  const [vertical, setVertical] = useState(true)
  const [swapped, setSwapped] = useState(false)
  const [hideSecond, setHideSecond] = useState(true)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/dominobw/${slug}`)
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
    const res = await fetch(`/api/dominobw/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: DbwView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as DbwView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live'
  const numbers = domino ? [Number(domino[0]), Number(domino[1])] : []
  const [head, tail] = swapped ? [numbers[1], numbers[0]] : numbers

  async function drop(col: number, row: number) {
    if (!myTurn || !domino) return
    const ok = await act('place', { domino, col, row, vertical, swapped, hideSecond })
    if (ok) setDomino('')
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
            {view.phase === 'live' && (myTurn ? 'Ваш ход' : 'Ход соперника')}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            {[view.ec, view.opponent].filter(Boolean).map(p => (
              <span key={p}>{p}: {view.points[p!] ?? 0} очк. · домино {view.handSizes[p!] ?? 0} </span>
            ))}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>
              Ход за {view.turn}: <Countdown deadline={view.deadline} />
            </span>
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
                <option value="">Кандидат на выбывание</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btn} disabled={busy} onClick={() => act('roles', { ec, opponent })}>
                Назначить
              </button>
            </div>
            <div className={styles.row}>
              <select className={styles.input} value={first} onChange={e => setFirst(e.target.value)}>
                <option value="">Кто ходит первым</option>
                {[view.ec, view.opponent].filter(Boolean).map(p => <option key={p} value={p!}>{p}</option>)}
              </select>
              <button className={styles.btnPrimary} disabled={busy || !view.ec || !view.opponent}
                onClick={() => act('start', { first })}>
                Начать
              </button>
            </div>
            <p className={styles.hint}>Первого хода выбирает игрок с преимуществом.</p>
          </div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Доска</div>
            <div className={styles.boardWrap}>
              <div className={styles.board}>
                {Array.from({ length: COLUMNS * ROWS }, (_, index) => {
                  const col = index % COLUMNS
                  const row = Math.floor(index / COLUMNS)
                  if (!isCell(col, row)) return <div key={index} className={`${styles.slot} ${styles.void}`} />
                  const half = view.cells[index]
                  if (!half) {
                    return (
                      <div key={index}
                        className={`${styles.slot} ${styles.empty} ${myTurn && domino ? styles.target : ''}`}
                        title={cellName(col, row)}
                        onClick={() => drop(col, row)} />
                    )
                  }
                  return (
                    <div key={index}
                      className={`${styles.slot} ${styles.half} ${half.black ? styles.black : styles.white}`}
                      title={`${cellName(col, row)} · ${half.owner}`}>
                      {half.value == null ? '?' : half.value}
                    </div>
                  )
                })}
              </div>
              <div className={styles.coords}>
                {Array.from({ length: COLUMNS }, (_, col) => (
                  <div key={col}>{String.fromCharCode(65 + col)}</div>
                ))}
              </div>
            </div>
            {view.lastPlacement && (
              <p className={styles.hint}>
                Последний ход: {view.lastPlacement.player} — {view.lastPlacement.conditions.join('') || 'без очков'}
                {view.lastPlacement.points > 0 && ` (+${view.lastPlacement.points})`}
              </p>
            )}
          </div>
        )}

        {view.isDuelist && view.phase === 'live' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши домино ({view.myHand.length})</div>
            <div className={styles.hand}>
              {view.myHand.map(id => (
                <button key={id} className={`${styles.tile} ${domino === id ? styles.tileChosen : ''}`}
                  onClick={() => setDomino(id)}>
                  <span className={`${styles.tileHalf} ${Number(id[0]) % 2 === 0 ? styles.black : styles.white}`}>
                    {id[0]}
                  </span>
                  <span className={`${styles.tileHalf} ${Number(id[1]) % 2 === 0 ? styles.black : styles.white}`}>
                    {id[1]}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <button className={`${styles.btn} ${vertical ? styles.toggle : ''}`}
                onClick={() => setVertical(v => !v)}>
                {vertical ? 'Вертикально' : 'Горизонтально'}
              </button>
              <button className={styles.btn} disabled={!domino} onClick={() => setSwapped(s => !s)}>
                Порядок: {head ?? '?'} затем {tail ?? '?'}
              </button>
              <button className={styles.btn} disabled={!domino} onClick={() => setHideSecond(h => !h)}>
                Прячем {hideSecond ? 'вторую' : 'первую'} половину
              </button>
            </div>
            <p className={styles.hint}>
              {myTurn
                ? domino
                  ? 'Теперь нажмите на клетку: туда встанет первая половина.'
                  : 'Выберите домино из руки.'
                : 'Ждём соперника.'}
            </p>
          </div>
        )}

        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить весь DM?')) act('reset') }}>
              Начать заново
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={DOMINO_BW_RULES} />

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
