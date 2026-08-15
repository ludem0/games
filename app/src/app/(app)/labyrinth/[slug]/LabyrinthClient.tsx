'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { LabView } from '@/lib/labyrinth'
import {
  COLOURS, COLOUR_HEX, COLOUR_NAMES, GATES, OPENINGS, ORIENTS, ORIENT_NAMES, ROTATE_CW,
  SIZE, colOf, rowOf, type Colour, type Orient,
} from '@/lib/labyrinthBoard'
import RulesCard from '@/components/RulesCard'
import { LABYRINTH_RULES } from './rules'
import styles from './labyrinth.module.css'

const POLL_MS = 4000
const TILE = 60
const UNIT = TILE / 3
const PAD = 44
const BOARD = PAD * 2 + SIZE * TILE

const WALL = '#a5581a'
const PATH = '#ffffa3'

interface Props {
  slug: string
  initialView: LabView
  username: string
  role: Role
  roster: string[]
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, deadline - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span className={left < 3600000 ? styles.clockLow : styles.clock}>
      {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

/** One maze tile drawn as a brown square with yellow arms poking out of it. */
function TileArt({ orient, size = TILE }: { orient: Orient; size?: number }) {
  const u = size / 3
  const open = OPENINGS[orient]
  return (
    <>
      <rect width={size} height={size} fill={WALL} />
      <rect x={u} y={u} width={u} height={u} fill={PATH} />
      {open.u && <rect x={u} y={0} width={u} height={u} fill={PATH} />}
      {open.r && <rect x={u * 2} y={u} width={u} height={u} fill={PATH} />}
      {open.d && <rect x={u} y={u * 2} width={u} height={u} fill={PATH} />}
      {open.l && <rect x={0} y={u} width={u} height={u} fill={PATH} />}
    </>
  )
}

function OrientButton({ orient, active, onClick }: { orient: Orient; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? styles.orientOn : styles.orient}
      onClick={onClick}
      title={ORIENT_NAMES[orient]}
    >
      <svg width={36} height={36} viewBox="0 0 36 36"><TileArt orient={orient} size={36} /></svg>
    </button>
  )
}

export default function LabyrinthClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<LabView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [orient, setOrient] = useState<Orient>(initialView.active)
  const [bid, setBid] = useState(0)
  const [prefs, setPrefs] = useState<Colour[]>([])
  const [target, setTarget] = useState('')
  const [seats, setSeats] = useState<string[]>(['', '', '', ''])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const isAdmin = role === 'admin'
  const mine = view.turn === username && view.phase === 'play'

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/labyrinth/${slug}`)
    if (res.ok) setView(await res.json())
  }, [slug])

  useEffect(() => {
    timer.current = setInterval(refresh, POLL_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [refresh])

  // the active piece changes after every shove, so follow it into the picker
  useEffect(() => { setOrient(view.active) }, [view.active])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/labyrinth/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Ошибка')
      else setView(data)
    } catch {
      setError('Сеть недоступна')
    } finally {
      setBusy(false)
    }
  }, [slug])

  const owner = (index: number) =>
    view.players.find(p => view.pawns[p] === index)

  const togglePref = (colour: Colour) => {
    setPrefs(prev => prev.includes(colour) ? prev.filter(c => c !== colour) : [...prev, colour])
  }

  const canShove = mine && view.step === 'shove'
  const canWalk = mine && view.step === 'move'

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← назад</Link>
        <span className={styles.navTitle}>{view.name}</span>
        <span className={styles.navUser}>{username}</span>
      </nav>

      <div className={styles.content}>
        <div className={styles.statusRow}>
          <span className={styles.phaseTag}>
            {view.phase === 'setup' && 'Ожидание игроков'}
            {view.phase === 'bid_start' && 'Аукцион за угол'}
            {view.phase === 'bid_order' && 'Аукцион за право хода'}
            {view.phase === 'play' && (mine ? (view.step === 'shove' ? 'Ваш ход: сдвиг' : 'Ваш ход: движение') : `Ходит ${view.turn}`)}
            {view.phase === 'pick_ec' && 'Победитель выбирает EC'}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          {view.deadline && <span className={styles.deadline}>До конца хода <Countdown deadline={view.deadline} /></span>}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {view.winner && (
          <div className={styles.winner}>
            Победил {view.winner}
            {view.ec && <> · кандидат на выбывание: {view.ec}</>}
          </div>
        )}

        <RulesCard sections={LABYRINTH_RULES} />

        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Игроки</div>
            <p className={styles.hint}>Порядок в списке решает ничьи: первым ставьте того, кто последним выиграл дэтматч.</p>
            {seats.map((seat, i) => (
              <select
                key={i}
                className={styles.select}
                value={seat}
                onChange={e => setSeats(prev => prev.map((s, j) => (j === i ? e.target.value : s)))}
              >
                <option value="">игрок {i + 1}</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ))}
            <button
              className={styles.primary}
              disabled={busy || seats.some(s => !s)}
              onClick={() => act({ action: 'players', players: seats, tiebreak: seats })}
            >
              Назначить
            </button>
          </div>
        )}

        {view.phase === 'bid_start' && view.isPlayer && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ставка за стартовый угол</div>
            {view.bidPlaced ? (
              <p className={styles.hint}>Ставка принята. Ждём остальных ({view.bidsIn} из 4).</p>
            ) : (
              <>
                <label className={styles.label}>Псигемы (0 до 8)</label>
                <input
                  className={styles.input}
                  type="number" min={0} max={8}
                  value={bid}
                  onChange={e => setBid(Number(e.target.value))}
                />
                <label className={styles.label}>Цвета по предпочтению, кликайте по порядку</label>
                <div className={styles.colourRow}>
                  {COLOURS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={prefs.includes(c) ? styles.colourOn : styles.colour}
                      style={{ borderColor: COLOUR_HEX[c] }}
                      onClick={() => togglePref(c)}
                    >
                      <span className={styles.swatch} style={{ background: COLOUR_HEX[c] }} />
                      {COLOUR_NAMES[c]}
                      {prefs.includes(c) && <b> {prefs.indexOf(c) + 1}</b>}
                    </button>
                  ))}
                </div>
                <button
                  className={styles.primary}
                  disabled={busy || prefs.length !== COLOURS.length}
                  onClick={() => act({ action: 'bidStart', bid, prefs })}
                >
                  Поставить
                </button>
              </>
            )}
          </div>
        )}

        {view.phase === 'bid_order' && view.isPlayer && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ставка за право первого хода</div>
            {view.bidPlaced ? (
              <p className={styles.hint}>Ставка принята. Ждём остальных ({view.bidsIn} из 4).</p>
            ) : (
              <>
                <label className={styles.label}>Псигемы (0 до 8)</label>
                <input
                  className={styles.input}
                  type="number" min={0} max={8}
                  value={bid}
                  onChange={e => setBid(Number(e.target.value))}
                />
                <label className={styles.label}>Кто ходит первым</label>
                <select className={styles.select} value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="">выберите игрока</option>
                  {view.players.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  className={styles.primary}
                  disabled={busy || !target}
                  onClick={() => act({ action: 'bidOrder', bid, target })}
                >
                  Поставить
                </button>
              </>
            )}
          </div>
        )}

        {(view.phase === 'play' || view.phase === 'pick_ec' || view.phase === 'finished') && view.order.length > 0 && (
          <>
            <div className={styles.boardWrap}>
              <svg width={BOARD} height={BOARD} viewBox={`0 0 ${BOARD} ${BOARD}`} className={styles.board}>
                <rect width={BOARD} height={BOARD} fill="#12121c" />

                {view.tiles.map((tile, index) => {
                  const x = PAD + colOf(index) * TILE
                  const y = PAD + rowOf(index) * TILE
                  const walkable = canWalk && view.moves.includes(index)
                  const pawn = owner(index)
                  const letter = view.letters[index]
                  const base = COLOURS.find(c => index === (c === 'red' ? 0 : c === 'yellow' ? SIZE - 1 : c === 'blue' ? SIZE * SIZE - 1 : SIZE * (SIZE - 1)))
                  return (
                    <g
                      key={index}
                      transform={`translate(${x} ${y})`}
                      className={walkable ? styles.cellOpen : undefined}
                      onClick={walkable && !busy ? () => act({ action: 'move', to: index }) : undefined}
                    >
                      <TileArt orient={tile} />
                      {base && (
                        <rect width={TILE} height={TILE} fill={COLOUR_HEX[base]} opacity={0.22} />
                      )}
                      {letter && (
                        <text x={TILE / 2} y={TILE / 2 + 5} textAnchor="middle" className={styles.letter}>{letter}</text>
                      )}
                      {pawn && (
                        <circle
                          cx={TILE / 2} cy={TILE / 2} r={UNIT * 0.6}
                          fill={COLOUR_HEX[view.colours[pawn]]}
                          stroke="#000" strokeWidth={2}
                        />
                      )}
                      {walkable && (
                        <rect width={TILE} height={TILE} fill="#4ade80" opacity={0.28} />
                      )}
                    </g>
                  )
                })}

                {GATES.map(gate => {
                  const along = PAD + gate.line * TILE + TILE / 2
                  const near = PAD / 2
                  const far = PAD + SIZE * TILE + PAD / 2
                  const x = gate.side === 'left' ? near : gate.side === 'right' ? far : along
                  const y = gate.side === 'top' ? near : gate.side === 'bottom' ? far : along
                  const blocked = view.blockedGate === gate.id
                  const usable = canShove && !blocked
                  return (
                    <g
                      key={gate.id}
                      transform={`translate(${x} ${y})`}
                      className={usable ? styles.gateOpen : styles.gate}
                      onClick={usable && !busy ? () => act({ action: 'shove', gate: gate.id, orient }) : undefined}
                    >
                      <circle r={15} fill={blocked ? '#3a2020' : usable ? '#1f6f3f' : '#22222e'} stroke={usable ? '#4ade80' : '#3a3a4a'} />
                      <text y={4} textAnchor="middle" className={styles.gateText}>{gate.id}</text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {canShove && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Сдвиг: выберите ориентацию, затем вход</div>
                <div className={styles.orientRow}>
                  {ORIENTS.map(o => (
                    <OrientButton key={o} orient={o} active={o === orient} onClick={() => setOrient(o)} />
                  ))}
                </div>
                <button className={styles.ghost} onClick={() => setOrient(ROTATE_CW[orient])}>Повернуть по часовой</button>
                {view.blockedGate && <p className={styles.hint}>Вход {view.blockedGate} закрыт: нельзя толкать линию обратно.</p>}
              </div>
            )}

            {canWalk && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Движение</div>
                <p className={styles.hint}>Зелёные клетки доступны. Чтобы остаться на месте, кликните по своей клетке.</p>
              </div>
            )}

            <div className={styles.card}>
              <div className={styles.cardTitle}>Активная фишка</div>
              <svg width={TILE} height={TILE} viewBox={`0 0 ${TILE} ${TILE}`}><TileArt orient={view.active} /></svg>
            </div>

            {view.isPlayer && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Ваша рука</div>
                <div className={styles.handRow}>
                  {view.hand.length === 0 ? <span className={styles.hint}>карт нет</span>
                    : view.hand.map(l => <span key={l} className={styles.chest}>{l}</span>)}
                </div>
                <p className={styles.hint}>В колоде осталось: {view.deckLeft}. Чужие базы пройдены: {view.visited.length} из 3.</p>
              </div>
            )}

            <div className={styles.card}>
              <div className={styles.cardTitle}>Охотники</div>
              <table className={styles.table}>
                <thead>
                  <tr><th>Игрок</th><th>Угол</th><th>Сундуки</th><th>Карт осталось</th></tr>
                </thead>
                <tbody>
                  {view.order.map(p => (
                    <tr key={p} className={view.turn === p ? styles.rowTurn : undefined}>
                      <td>{p}</td>
                      <td>
                        <span className={styles.swatch} style={{ background: COLOUR_HEX[view.colours[p]] }} />
                        {COLOUR_NAMES[view.colours[p]]}
                      </td>
                      <td>{view.collected[p]?.length ?? 0} из 6</td>
                      <td>{view.cardsLeft[p]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view.phase === 'pick_ec' && username === view.winner && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Выберите кандидата на выбывание</div>
            <div className={styles.handRow}>
              {view.ecChoices.map(p => (
                <button key={p} className={styles.primary} disabled={busy} onClick={() => act({ action: 'ec', target: p })}>{p}</button>
              ))}
            </div>
          </div>
        )}

        <details className={styles.card}>
          <summary className={styles.cardTitle}>Журнал</summary>
          <ul className={styles.log}>
            {[...view.log].reverse().map((entry, i) => (
              <li key={i}><span className={styles.logTime}>{new Date(entry.at).toLocaleString('ru')}</span> {entry.text}</li>
            ))}
          </ul>
        </details>

        {isAdmin && (
          <button className={styles.ghost} disabled={busy} onClick={() => act({ action: 'reset' })}>Сбросить матч</button>
        )}
      </div>
    </div>
  )
}
