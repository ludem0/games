'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { TmrView, RoomId } from '@/lib/modularRooms'
import RulesCard from '@/components/RulesCard'
import { ROOMS_RULES } from './rules'
import styles from './rooms.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 5000
const ROOMS: RoomId[] = ['null', 'solitary', 'duel']
const ROOM_NAMES: Record<RoomId, string> = { null: 'Null', solitary: 'Solitary', duel: 'Duel' }
const ROOM_RULES: Record<RoomId, string> = {
  null: 'бонус при остатке 0', solitary: 'бонус при остатке 1', duel: 'бонус при остатке 2',
}

interface Props {
  slug: string
  initialView: TmrView
  username: string
  role: Role
  roster: string[]
}


export default function RoomsClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<TmrView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<number | null>(null)
  const [room, setRoom] = useState<RoomId | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/modularrooms/${slug}`)
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
    const res = await fetch(`/api/modularrooms/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: TmrView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as TmrView)
    return true
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
            {view.phase === 'setup' && 'Подготовка'}
            {view.phase === 'live' && `Раунд ${view.roundNumber} из 11`}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          <span className={styles.roles}>Сдали ход: {view.submitted.length} из {view.players.length}</span>
          {view.deadline && (
            <span className={styles.deadline}>До конца раунда: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.winner.length > 0 && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner.join(', ')}</strong></div>
        )}

        {/* what the last round did */}
        {view.lastRound && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Раунд {view.lastRound.number}</div>
            <div className={styles.rooms}>
              {ROOMS.map(id => {
                const report = view.lastRound!.rooms[id]
                return (
                  <div key={id} className={styles.room}>
                    <div className={styles.roomName}>{ROOM_NAMES[id]}</div>
                    <div className={styles.roomScore}>{report.score}</div>
                    {report.bonus && (
                      <div className={styles.roomBonus}>бонус ×{report.multiplier}</div>
                    )}
                    <div className={styles.roomRule}>
                      {report.players.length > 0 ? report.players.join(', ') : `человек: ${report.count}`}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className={styles.hint}>Очко получили: {view.lastRound.scorers.join(', ') || 'никто'}</p>
          </div>
        )}

        {/* my move */}
        {view.amPlayer && view.phase === 'live' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {view.myPlay ? 'Ход сдан, можно поменять до дедлайна' : 'Ваш ход'}
            </div>
            <div className={styles.rooms}>
              {ROOMS.map(id => (
                <button key={id}
                  className={`${styles.room} ${styles.roomPick} ${(room ?? view.myPlay?.room) === id ? styles.roomChosen : ''}`}
                  onClick={() => setRoom(id)}>
                  <div className={styles.roomName}>{ROOM_NAMES[id]}</div>
                  <div className={styles.roomRule}>{ROOM_RULES[id]}</div>
                </button>
              ))}
            </div>
            <div className={styles.hand}>
              {view.myHand.map((value, index) => (
                <button key={`${value}-${index}`}
                  className={`${styles.cardBtn} ${(card ?? view.myPlay?.card) === value ? styles.cardChosen : ''}`}
                  onClick={() => setCard(value)}>
                  {value}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <button className={styles.btnPrimary}
                disabled={busy || (card ?? view.myPlay?.card) == null || (room ?? view.myPlay?.room) == null}
                onClick={() => act('play', {
                  card: card ?? view.myPlay?.card,
                  room: room ?? view.myPlay?.room,
                })}>
                Сдать ход
              </button>
              {view.myPlay && (
                <span className={styles.hint}>
                  Сейчас: карта {view.myPlay.card}, комната {ROOM_NAMES[view.myPlay.room]}
                </span>
              )}
            </div>

            <div className={styles.row}>
              <button className={styles.btn} disabled={busy || card == null}
                onClick={() => act('buycard', { card })}>
                Купить копию карты {card ?? ''} за 5 Ψ
              </button>
              <button className={styles.btn} disabled={busy} onClick={() => act('hide')}>
                Скрыть состав комнат за 3 Ψ
              </button>
            </div>
          </div>
        )}

        {view.notes.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши записи</div>
            <div className={styles.notes}>
              {view.notes.map((text, i) => <div key={i} className={styles.note}>{text}</div>)}
            </div>
          </div>
        )}

        {view.players.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Очки</div>
            <div className={styles.counts}>
              {view.players.map(player => (
                <span key={player}>{player}: <strong>{view.points[player] ?? 0}</strong></span>
              ))}
            </div>
            {view.payout && (
              <p className={styles.hint}>
                Начислено: {Object.entries(view.payout.psigems).map(([p, v]) => `${p} +${v} Ψ`).join(', ') || 'ничего'}
                {' · жетоны: '}{Object.entries(view.payout.tol).map(([p, v]) => `${p} +${v}`).join(', ') || 'нет'}
                {' · опалы: '}{Object.keys(view.payout.opals).join(', ') || 'нет'}
              </p>
            )}
          </div>
        )}

        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            {view.phase === 'setup' ? (
              <>
                <div className={styles.row}>
                  {roster.map(player => (
                    <button key={player}
                      className={`${styles.btn} ${picked.includes(player) ? styles.toggle : ''}`}
                      onClick={() => setPicked(p =>
                        p.includes(player) ? p.filter(x => x !== player) : [...p, player])}>
                      {player}
                    </button>
                  ))}
                </div>
                <button className={styles.btnPrimary} disabled={busy || picked.length < 3}
                  onClick={() => act('start', { players: picked })}>
                  Начать матч с {picked.length} игроками
                </button>
              </>
            ) : (
              <div className={styles.row}>
                <button className={styles.btn} disabled={busy || view.phase === 'finished'}
                  onClick={() => act('close')}>
                  Закрыть раунд сейчас
                </button>
                <button className={styles.btnDanger} disabled={busy}
                  onClick={() => { if (confirm('Сбросить весь матч?')) act('reset') }}>
                  Сбросить матч
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={ROOMS_RULES} />

        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход матча</div>
          <div className={styles.log}>
            {view.log.length === 0 && <p className={styles.hint}>Пусто</p>}
            {view.log.map((e, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logTime}>
                  {new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
