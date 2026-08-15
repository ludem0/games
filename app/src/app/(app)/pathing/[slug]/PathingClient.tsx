'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { PdbView, Colour } from '@/lib/pathing'
import RulesCard from '@/components/RulesCard'
import { PATHING_RULES } from './rules'
import styles from './pathing.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 2000
const SIZE = 4

interface Props {
  slug: string
  initialView: PdbView
  username: string
  role: Role
  roster: string[]
}

const cellName = (index: number) =>
  `${String.fromCharCode(65 + (index % SIZE))}${Math.floor(index / SIZE) + 1}`

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)


const COLOUR_CLASS: Record<Colour, string> = {
  red: styles.red, blue: styles.blue, white: styles.white,
}

/** The right hand board: nodes, the lines drawn so far, and the closed boxes. */
function SupportBoard({ view }: { view: PdbView }) {
  const step = 100 / SIZE
  const colourOf = (player: string | null | undefined): Colour | null =>
    player ? view.colours[player] ?? null : null

  return (
    <div className={styles.support}>
      {view.boxes.map((owner, box) => {
        const row = Math.floor(box / (SIZE - 1))
        const col = box % (SIZE - 1)
        const colour = colourOf(owner)
        return (
          <div key={`box${box}`}
            className={`${styles.box} ${colour === 'red' ? styles.boxRed : colour === 'blue' ? styles.boxBlue : ''}`}
            style={{
              left: `${(col + 0.5) * step + 2}%`, top: `${(row + 0.5) * step + 2}%`,
              width: `${step - 4}%`, height: `${step - 4}%`,
            }} />
        )
      })}

      {Object.entries(view.edges).map(([key, owner]) => {
        const [a, b] = key.split('-').map(Number)
        const colour = colourOf(owner)
        const cls = `${styles.line} ${colour === 'red' ? styles.lineRed : colour === 'blue' ? styles.lineBlue : ''}`
        const rowA = Math.floor(a / SIZE)
        const colA = a % SIZE
        const horizontal = b === a + 1
        return (
          <div key={key} className={cls} style={horizontal ? {
            left: `${(colA + 0.5) * step + 4}%`, top: `${(rowA + 0.5) * step - 1}%`,
            width: `${step - 8}%`, height: '2.5%',
          } : {
            left: `${(colA + 0.5) * step - 1}%`, top: `${(rowA + 0.5) * step + 4}%`,
            width: '2.5%', height: `${step - 8}%`,
          }} />
        )
      })}

      {Array.from({ length: SIZE * SIZE }, (_, cell) => {
        const row = Math.floor(cell / SIZE)
        const col = cell % SIZE
        return (
          <div key={cell} className={styles.node}
            style={{ left: `${col * step + step / 2 - 9}%`, top: `${row * step + step / 2 - 9}%` }}>
            {cellName(cell)}
          </div>
        )
      })}
    </div>
  )
}

export default function PathingClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<PdbView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picks, setPicks] = useState<number[]>([])
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/pathing/${slug}`)
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
    const res = await fetch(`/api/pathing/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: PdbView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as PdbView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live'
  const owing = view.phase === 'convert' && view.owes === username

  async function pick(cell: number) {
    if (owing) {
      if (!view.legalCells.includes(cell)) return
      await act('convert', { cell })
      setPicks([])
      return
    }
    if (!myTurn) return
    const next = picks.includes(cell) ? picks.filter(c => c !== cell) : [...picks, cell].slice(-2)
    setPicks(next)
    if (next.length === 2) {
      const ok = await act('swap', { a: next[0], b: next[1] })
      if (ok) setPicks([])
    }
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
            {view.phase === 'live' && `Раунд ${view.round}`}
            {view.phase === 'convert' && 'Расплата за раунд'}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          {view.ec && view.opponent && (
            <span className={styles.roles}>
              {view.ec} ({view.colours[view.ec] === 'red' ? 'красные' : 'синие'}) против{' '}
              {view.opponent} ({view.colours[view.opponent] === 'red' ? 'красные' : 'синие'})
            </span>
          )}
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
                <option value="">Кандидат на выбывание (красные)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (синие)</option>
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
            <p className={styles.hint}>Первого хода выбирает игрок с преимуществом, ведущий вносит его решение.</p>
          </div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {owing
                ? 'Вы проиграли вспомогательную доску: выберите клетку'
                : myTurn ? 'Ваш ход: выберите две соседние клетки' : 'Доски'}
            </div>
            <div className={styles.boards}>
              <div className={styles.grid}>
                {view.board.map((colour, cell) => {
                  const selectable = owing ? view.legalCells.includes(cell) : myTurn
                  const cls = [
                    styles.cell,
                    COLOUR_CLASS[colour],
                    selectable ? styles.pickable : '',
                    picks.includes(cell) ? styles.picked : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button key={cell} className={cls} disabled={busy || !selectable}
                      onClick={() => pick(cell)}>
                      {cellName(cell)}
                    </button>
                  )
                })}
              </div>
              <SupportBoard view={view} />
            </div>
            <div className={styles.counts}>
              {Object.entries(view.boxCounts).map(([player, count]) => (
                <span key={player}>Коробки {player}: <strong>{count}</strong> · резерв{' '}
                  {Math.floor((view.reserveMs[player] ?? 0) / 60000)}:
                  {String(Math.floor(((view.reserveMs[player] ?? 0) % 60000) / 1000)).padStart(2, '0')}
                </span>
              ))}
            </div>
            {picks.length === 1 && <p className={styles.hint}>Выбрана {cellName(picks[0])}, укажите соседнюю.</p>}
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

        <RulesCard sections={PATHING_RULES} />

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
