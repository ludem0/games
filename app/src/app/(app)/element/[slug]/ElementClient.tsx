'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { ElView, Stone } from '@/lib/element'
import RulesCard from '@/components/RulesCard'
import { ELEMENT_RULES } from './rules'
import styles from './element.module.css'

const POLL_MS = 2000
const SIZE = 11
const DRAW = 4

const STONE_NAMES: Record<Stone, string> = {
  fire: 'огонь', wind: 'ветер', earth: 'земля', water: 'вода',
}
const STONE_CLASS: Record<Stone, string> = {
  fire: styles.fire, wind: styles.wind, earth: styles.earth, water: styles.water,
}
const FLOWS: { label: string; direction: [number, number] }[] = [
  { label: '↑ вверх', direction: [0, -1] },
  { label: '↓ вниз', direction: [0, 1] },
  { label: '← влево', direction: [-1, 0] },
  { label: '→ вправо', direction: [1, 0] },
]

const squareName = (index: number) =>
  `${String.fromCharCode(65 + (index % SIZE))}${Math.floor(index / SIZE) + 1}`

interface Props {
  slug: string
  initialView: ElView
  username: string
  role: Role
  roster: string[]
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

export default function ElementClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<ElView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<number | null>(null)
  const [flow, setFlow] = useState(0)
  const [draw, setDraw] = useState(DRAW)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/element/${slug}`)
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
    const res = await fetch(`/api/element/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: ElView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as ElView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live'
  const mySage = view.sages[username]
  const rival = username === view.ec ? view.opponent : view.ec
  const rivalSage = rival ? view.sages[rival] : undefined
  const stone = held == null ? null : view.pending[held]
  const jumpTo = new Set(view.jumps.map(j => j.to))

  async function clickSquare(index: number) {
    if (!myTurn) return
    if (stone) {
      const ok = await act('place', {
        stone, square: index,
        direction: stone === 'water' ? FLOWS[flow].direction : undefined,
      })
      if (ok) setHeld(null)
      return
    }
    if (jumpTo.has(index)) { await act('jump', { to: index }); return }
    if (view.steps.includes(index)) await act('step', { to: index })
  }

  function cellClass(index: number): string {
    const cell = view.board[index]
    const classes = [styles.cell]
    if (index === mySage) classes.push(styles.sageMine)
    else if (index === rivalSage) classes.push(styles.sageRival)
    else if (cell) {
      classes.push(STONE_CLASS[cell.stone])
      if (cell.stone === 'earth' && cell.height >= 2) classes.push(styles.mountain)
    }
    if (myTurn) {
      if (stone) classes.push(styles.placeTarget)
      else if (jumpTo.has(index)) classes.push(styles.jumpTarget)
      else if (view.steps.includes(index)) classes.push(styles.stepTarget)
    }
    return classes.join(' ')
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
            {view.phase === 'live' && (myTurn ? 'Ваш ход' : `Ход ${view.turn}`)}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            {view.ec && `Кандидат: ${view.ec}`}{view.opponent && ` · Оппонент: ${view.opponent}`}
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
              <button className={styles.btnPrimary} disabled={busy || !view.ec} onClick={() => act('start', { first })}>
                Начать
              </button>
            </div>
          </div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Доска</div>
            <div className={styles.boardWrap}>
              <div className={styles.board}>
                {view.board.map((cell, index) => (
                  <button key={index}
                    className={cellClass(index)}
                    title={squareName(index)}
                    disabled={!myTurn}
                    onClick={() => clickSquare(index)}>
                    {index === mySage || index === rivalSage ? '☗' : cell && cell.height > 1 ? cell.height : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.legend}>
              <span><i className={`${styles.swatch} ${styles.fire}`} />огонь</span>
              <span><i className={`${styles.swatch} ${styles.wind}`} />ветер</span>
              <span><i className={`${styles.swatch} ${styles.earth}`} />земля</span>
              <span><i className={`${styles.swatch} ${styles.water}`} />вода</span>
              <span><i className={`${styles.swatch} ${styles.sageMine}`} />вы</span>
              <span><i className={`${styles.swatch} ${styles.sageRival}`} />соперник</span>
            </div>
          </div>
        )}

        {view.isDuelist && view.phase === 'live' && myTurn && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваш ход</div>

            {!view.drawn ? (
              <div className={styles.row}>
                <span className={styles.hint}>Сколько камней взять:</span>
                {[0, 1, 2, 3, 4].map(n => (
                  <button key={n} className={`${styles.btn} ${draw === n ? styles.toggle : ''}`}
                    onClick={() => setDraw(n)}>{n}</button>
                ))}
                <button className={styles.btnPrimary} disabled={busy}
                  onClick={() => act('draw', { count: draw })}>
                  Взять ({1 + (DRAW - draw)} шагов)
                </button>
              </div>
            ) : (
              <>
                <div className={styles.row}>
                  <span className={styles.hint}>Шагов осталось: {view.moves}</span>
                  {view.jumps.length > 0 && <span className={styles.hint}>Прыжков: {view.jumps.length}</span>}
                </div>

                <div className={styles.stones}>
                  {view.pending.map((s, i) => (
                    <button key={i}
                      className={`${styles.stoneBtn} ${held === i ? styles.stoneChosen : ''}`}
                      onClick={() => setHeld(held === i ? null : i)}>
                      {STONE_NAMES[s]}
                    </button>
                  ))}
                  {view.pending.length === 0 && <span className={styles.hint}>Все камни выложены</span>}
                </div>

                {stone === 'water' && (
                  <div className={styles.row}>
                    <span className={styles.hint}>Куда потечёт река:</span>
                    {FLOWS.map((f, i) => (
                      <button key={f.label} className={`${styles.btn} ${flow === i ? styles.toggle : ''}`}
                        onClick={() => setFlow(i)}>{f.label}</button>
                    ))}
                  </div>
                )}

                <p className={styles.hint}>
                  {stone
                    ? `Выберите клетку для камня «${STONE_NAMES[stone]}»`
                    : 'Зелёная рамка — шаг, розовая — прыжок через ветер'}
                </p>

                <button className={styles.btnPrimary}
                  disabled={busy || view.pending.length > 0}
                  onClick={() => act('end')}>
                  Закончить ход
                </button>
              </>
            )}
          </div>
        )}

        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить весь матч?')) act('reset') }}>
              Сбросить
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={ELEMENT_RULES} />

        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход матча</div>
          <div className={styles.log}>
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
