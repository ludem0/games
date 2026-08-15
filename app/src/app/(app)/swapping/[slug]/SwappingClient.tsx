'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { SwView, SwSeat } from '@/lib/swapping'
import RulesCard from '@/components/RulesCard'
import { SWAPPING_RULES } from './rules'
import styles from './swapping.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 2000
const MAX_GAMES = 3

interface Props {
  slug: string
  initialView: SwView
  username: string
  role: Role
  roster: string[]
}


function tileClass(tile: number | null, extra = ''): string {
  const base = tile == null
    ? `${styles.tile} ${styles.tileHidden}`
    : `${styles.tile} ${tile % 2 === 0 ? styles.tileBlack : styles.tileWhite}`
  return `${base} ${extra}`.trim()
}

/** One player's nine positions. */
function Seat({
  seat, picks, onPick,
}: {
  seat: SwSeat
  picks: number[]
  onPick: ((position: number) => void) | null
}) {
  return (
    <div className={styles.seat}>
      <div className={styles.seatName}>
        {seat.player}{seat.isMe && ' (вы)'}
        <span className={`${styles.tag} ${seat.submitted ? styles.tagDone : ''}`}>
          {seat.submitted ? 'ход сдан' : 'думает'}
        </span>
      </div>
      <div className={styles.strip}>
        {seat.tiles.map((tile, i) => {
          const faceDown = !seat.revealed[i]
          const cls = tileClass(tile, [
            faceDown ? styles.tileFaceDown : '',
            onPick ? styles.tilePick : '',
            picks.includes(i) ? styles.tileChosen : '',
          ].filter(Boolean).join(' '))
          return (
            <button key={i} className={cls} disabled={!onPick} onClick={() => onPick?.(i)}>
              {tile == null ? '?' : tile}
            </button>
          )
        })}
      </div>
      <div className={styles.positions}>
        {seat.tiles.map((_, i) => <div key={i} className={styles.position}>{i + 1}</div>)}
      </div>
    </div>
  )
}

export default function SwappingClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<SwView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [trio, setTrio] = useState<number[]>([])
  const [picks, setPicks] = useState<number[]>([])
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/swapping/${slug}`)
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
    const res = await fetch(`/api/swapping/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: SwView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as SwView)
    return true
  }

  const mySeat = view.seats.find(s => s.isMe) ?? null
  const myMove = view.isDuelist && !view.iSubmitted && view.phase !== 'setup' && view.phase !== 'finished'
  const swapping = view.phase === 'swap' && view.swapStep === 'swap'
  const revealing = view.phase === 'swap' && view.swapStep === 'reveal'
  const from = view.playStep * 3

  function pickPosition(position: number) {
    if (!myMove || !mySeat || mySeat.revealed[position]) return
    if (revealing) { setPicks([position]); return }
    if (!swapping) return
    setPicks(p => (p.includes(position) ? p.filter(x => x !== position) : [...p, position].slice(-2)))
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
            {view.phase === 'play' && `Игра ${view.round}: выкладка ${view.playStep + 1}/3`}
            {view.phase === 'swap' && `Игра ${view.round}: ${swapping ? 'обмен' : 'открытие'}`}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          {view.ec && view.opponent && (
            <span className={styles.roles}>
              Кандидат на выбывание: <strong>{view.ec}</strong> · Оппонент: <strong>{view.opponent}</strong>
            </span>
          )}
          {view.deadline && (
            <span className={styles.deadline}>Ваш срок: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа в DM: <strong>{view.winner}</strong></div>
        )}

        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Роли</div>
            <div className={styles.row}>
              <select className={styles.input} value={ec} onChange={e => setEc(e.target.value)}>
                <option value="">Кандидат на выбывание (EC)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (выбран EC)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btn} disabled={busy} onClick={() => act('roles', { ec, opponent })}>
                Назначить
              </button>
            </div>
            <button className={styles.btnPrimary} disabled={busy || !view.ec || !view.opponent}
              onClick={() => act('start')}>
              Начать игру 1
            </button>
          </div>
        )}

        {/* the boards */}
        {view.seats.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Позиции</div>
            {view.seats.map(seat => (
              <Seat
                key={seat.player}
                seat={seat}
                picks={seat.isMe ? picks : []}
                onPick={seat.isMe && myMove && view.phase === 'swap' ? pickPosition : null}
              />
            ))}
            <div className={styles.scores}>
              {view.seats.map(s => (
                <span key={s.player}>
                  {s.player}: очки выкладки <strong>{view.playPoints[s.player] ?? 0}</strong>
                  {' · резерв '}
                  {Math.floor((view.reserveMs[s.player] ?? 0) / 60000)}:
                  {String(Math.floor(((view.reserveMs[s.player] ?? 0) % 60000) / 1000)).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* laying out a trio */}
        {view.phase === 'play' && view.isDuelist && !view.iSubmitted && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Позиции {from + 1}-{from + 3}: выберите три плитки по порядку</div>
            <div className={styles.hand}>
              {view.myHand.map(tile => (
                <button key={tile}
                  className={tileClass(tile, trio.includes(tile) ? styles.tileChosen : styles.tilePick)}
                  onClick={() => setTrio(t => (t.includes(tile) ? t.filter(x => x !== tile) : [...t, tile].slice(0, 3)))}>
                  {tile}
                </button>
              ))}
            </div>
            <div className={styles.slotRow}>
              {[0, 1, 2].map(i => (
                <div key={i} className={`${styles.slot} ${trio[i] != null ? styles.slotFilled : ''}`}>
                  {trio[i] ?? '—'}
                  <div className={styles.position}>поз. {from + i + 1}</div>
                </div>
              ))}
              <button className={styles.btnPrimary} disabled={busy || trio.length !== 3}
                onClick={async () => { if (await act('play', { tiles: trio })) setTrio([]) }}>
                Выложить
              </button>
            </div>
            <p className={styles.hint}>Порядок нажатий задаёт позиции. Соперник выкладывает одновременно с вами.</p>
          </div>
        )}

        {/* swapping and revealing */}
        {view.phase === 'swap' && view.isDuelist && !view.iSubmitted && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {swapping ? 'Обмен: выберите две свои закрытые плитки' : 'Открытие: выберите свою закрытую плитку'}
            </div>
            <p className={styles.hint}>
              {swapping
                ? 'Одна плитка должна быть чёрной (чётной), вторая белой (нечётной). Нажимайте по своей строке выше.'
                : 'Обе выбранные плитки откроются публично одновременно.'}
            </p>
            <div className={styles.row}>
              <span>Выбрано: <strong>{picks.map(i => i + 1).join(', ') || '—'}</strong></span>
              <button className={styles.btnPrimary}
                disabled={busy || (swapping ? picks.length !== 2 : picks.length !== 1)}
                onClick={async () => {
                  const ok = swapping
                    ? await act('swap', { pair: picks })
                    : await act('reveal', { position: picks[0] })
                  if (ok) setPicks([])
                }}>
                {swapping ? 'Поменять' : 'Открыть'}
              </button>
            </div>
          </div>
        )}

        {view.isDuelist && view.iSubmitted && view.phase !== 'finished' && !view.awaitingNextGame && (
          <p className={styles.waiting}>
            {view.rivalSubmitted ? 'Считаем результат…' : 'Ждём соперника…'}
          </p>
        )}

        {/* the series */}
        {view.results.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Серия</div>
            <div className={styles.games}>
              {view.results.map(r => (
                <span key={r.number} className={styles.gameChip}>
                  Игра {r.number}: {r.winner
                    ? `победа ${r.winner}`
                    : Object.keys(r.points).length > 0 ? 'ничья' : 'идёт'}
                  {Object.keys(r.points).length > 0 &&
                    ` (${Object.entries(r.points).map(([p, v]) => `${p} ${v}`).join(' : ')})`}
                </span>
              ))}
            </div>
          </div>
        )}

        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <div className={styles.row}>
              {view.awaitingNextGame && (
                <button className={styles.btnPrimary} disabled={busy} onClick={() => act('nextgame')}>
                  Начать игру {view.results.length + 1} из {MAX_GAMES}
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

        <RulesCard sections={SWAPPING_RULES} />

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
