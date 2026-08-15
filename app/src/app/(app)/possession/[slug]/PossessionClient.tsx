'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { FfpView, Stone } from '@/lib/possession'
import RulesCard from '@/components/RulesCard'
import { POSSESSION_RULES } from './rules'
import styles from './ghost.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 5000
const THROWS = [
  { id: 'rock', label: 'Камень' },
  { id: 'paper', label: 'Бумага' },
  { id: 'scissors', label: 'Ножницы' },
] as const

const STONE_CLASS: Record<Stone, string> = {
  grey: styles.grey, white: styles.white, black: styles.black,
  green: styles.green, red: styles.red,
}

const ROLE_TEXT = {
  possessed: 'Вы одержимый',
  hunter: 'Вы охотник за призраками',
  player: 'Вы обычный игрок',
}

interface Props {
  slug: string
  initialView: FfpView
  username: string
  role: Role
  roster: string[]
}


export default function PossessionClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<FfpView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [bet, setBet] = useState('1')
  const [thrown, setThrown] = useState<'rock' | 'paper' | 'scissors'>('rock')
  const [card, setCard] = useState<number | null>(null)
  const [bid, setBid] = useState('0')
  const [identities, setIdentities] = useState<Record<string, string>>({})
  const [guessPossessed, setGuessPossessed] = useState('')
  const [guessHunter, setGuessHunter] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/possession/${slug}`)
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
    const res = await fetch(`/api/possession/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: FfpView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as FfpView)
    return true
  }

  const live = view.phase === 'live' && view.amPlaying
  const stones = view.myStones
  const stopped = stones.includes('red')

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
            {view.phase === 'live' && `Раунд ${view.roundNumber} из 12`}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>До дедлайна: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.myRole && view.phase === 'live' && (
          <div className={`${styles.role} ${view.myRole === 'possessed' ? styles.rolePossessed : view.myRole === 'hunter' ? styles.roleHunter : ''}`}>
            {ROLE_TEXT[view.myRole]}
          </div>
        )}

        {view.winner.length > 0 && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner.join(', ')}</strong></div>
        )}

        {live && (
          <>
            <div className={styles.card}>
              <div className={styles.cardTitle}>MG1 · RPS на ставку</div>
              <div className={styles.row}>
                <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                  <option value="">Соперник</option>
                  {view.players.filter(p => p !== username).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input className={styles.input} style={{ width: 80 }} type="number" min={1} max={5}
                  value={bet} onChange={e => setBet(e.target.value)} />
                {THROWS.map(item => (
                  <button key={item.id} className={`${styles.btn} ${thrown === item.id ? styles.toggle : ''}`}
                    onClick={() => setThrown(item.id)}>{item.label}</button>
                ))}
                <button className={styles.btn} disabled={busy || !opponent}
                  onClick={() => act('submit', { rps: { opponent, bet: Number(bet), throw: thrown } })}>
                  Заявить
                </button>
              </div>
              {view.mySubmission?.rps && (
                <p className={styles.hint}>
                  Заявлено: {view.mySubmission.rps.opponent}, ставка {view.mySubmission.rps.bet}
                </p>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>MG2 · Медиана</div>
              <div className={styles.cards}>
                {view.myHand.map(value => (
                  <button key={value}
                    className={`${styles.numCard} ${card === value ? styles.cardChosen : ''}`}
                    onClick={() => setCard(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <button className={styles.btnPrimary} disabled={busy || card == null}
                onClick={() => act('submit', { card })}>
                Сыграть карту {card ?? ''}
              </button>
              {view.mySubmission?.card && (
                <p className={styles.hint}>Заявлена карта {view.mySubmission.card}</p>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>MG3 · Жадность</div>
              <div className={styles.stones}>
                {stones.map((stone, i) => (
                  <span key={i}
                    className={`${styles.stone} ${STONE_CLASS[stone]} ${view.mySubmission?.ignored === i ? styles.stoneIgnored : ''}`}
                    title={stone}
                    onClick={() => view.myRole === 'possessed' && act('ignore', { ignore: i })} />
                ))}
              </div>
              <div className={styles.row}>
                <button className={styles.btn} disabled={busy || stopped} onClick={() => act('draw')}>
                  Тянуть камень
                </button>
                <span className={styles.hint}>
                  {stopped ? 'Красный камень остановил добычу.' : `Вытянуто: ${stones.length}. Участие стоит 1 псигем.`}
                  {view.myRole === 'possessed' && ' Нажмите на камень, чтобы проигнорировать его.'}
                </span>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>MG4 · Торги</div>
              <div className={styles.row}>
                <input className={styles.input} style={{ width: 90 }} type="number" min={0} max={10}
                  value={bid} onChange={e => setBid(e.target.value)} />
                <button className={styles.btn} disabled={busy}
                  onClick={() => act('submit', { bid: Number(bid) })}>
                  Поставить
                </button>
                {view.mySubmission?.bid != null && (
                  <span className={styles.hint}>Заявлено: {view.mySubmission.bid}</span>
                )}
              </div>
            </div>

            {view.previousLabels.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>MG5 · Личности прошлого раунда</div>
                {view.previousLabels.map(label => (
                  <div key={label} className={styles.row}>
                    <span style={{ minWidth: 90 }}>{label}:</span>
                    <select className={styles.input} value={identities[label] ?? ''}
                      onChange={e => setIdentities(prev => ({ ...prev, [label]: e.target.value }))}>
                      <option value="">кто это</option>
                      {view.players.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                ))}
                <div className={styles.row}>
                  <select className={styles.input} value={guessPossessed}
                    onChange={e => setGuessPossessed(e.target.value)}>
                    <option value="">Кто был одержимым</option>
                    {view.players.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className={styles.input} value={guessHunter}
                    onChange={e => setGuessHunter(e.target.value)}>
                    <option value="">Кто был охотником</option>
                    {view.players.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <button className={styles.btnPrimary} disabled={busy}
                  onClick={() => act('submit', {
                    identities,
                    guess: guessPossessed && guessHunter
                      ? { possessed: guessPossessed, hunter: guessHunter }
                      : undefined,
                  })}>
                  Сдать догадки
                </button>
              </div>
            )}
          </>
        )}

        {view.lastReport.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Прошлый раунд</div>
            {view.lastReport.map((line, i) => <p key={i} className={styles.hint}>{line}</p>)}
          </div>
        )}

        {view.reveal && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Роли по раундам</div>
            <div className={styles.counts}>
              {view.reveal.map(row => (
                <span key={row.round}>
                  {row.round}: {row.possessed ?? 'никого'}
                  {row.hunter && ` / охотник ${row.hunter}`}
                  {row.challenges > 0 && ` · заданий ${row.challenges}`}
                </span>
              ))}
            </div>
            {view.points && (
              <p className={styles.hint}>
                Очки: {Object.entries(view.points).map(([p, v]) => `${p} ${v}`).join(', ')}
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
                        p.includes(player) ? p.filter(x => x !== player) : [...p, player].slice(0, 5))}>
                      {player}
                    </button>
                  ))}
                </div>
                <button className={styles.btnPrimary} disabled={busy || picked.length !== 5}
                  onClick={() => act('start', { players: picked })}>
                  Начать матч с пятью игроками
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

        <RulesCard sections={POSSESSION_RULES} />

        {view.log.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ход матча</div>
            <div className={styles.log}>
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
        )}
      </main>
    </div>
  )
}
