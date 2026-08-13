'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { ChView, Channel, Card } from '@/lib/channelHopping'
import RulesCard from '@/components/RulesCard'
import { CHANNEL_HOPPING_RULES } from './rules'
import styles from './channelhopping.module.css'

const POLL_MS = 1500

interface Props {
  slug: string
  initialView: ChView
  username: string
  role: Role
  roster: string[]
}

const SHAPE_PATH: Record<Card['shape'], string> = {
  circle: 'M50 15a35 35 0 1 0 0.1 0Z',
  triangle: 'M50 12 L88 84 L12 84 Z',
  square: 'M16 16 h68 v68 h-68 Z',
}
const COLOUR_HEX: Record<Card['colour'], string> = {
  red: '#e11d48', blue: '#2563eb', yellow: '#facc15',
}

function HapCard({ card, index }: { card: Card; index: number }) {
  const bg = card.background === 'white' ? styles.bgWhite : card.background === 'black' ? styles.bgBlack : styles.bgGrey
  return (
    <div className={`${styles.hapCard} ${bg}`}>
      <span className={styles.index}>{index + 1}</span>
      <svg viewBox="0 0 100 100" width="70%" height="70%" aria-hidden>
        <path d={SHAPE_PATH[card.shape]} fill={COLOUR_HEX[card.colour]} stroke="#111" strokeWidth="4" />
      </svg>
    </div>
  )
}

/** One channel: the prompt, a box to answer in, and what the grader said. */
function ChannelCard({
  channel, title, prompt, answer, disabled, onSend, children,
}: {
  channel: Channel
  title: string
  prompt: React.ReactNode
  answer: ChView['myAnswers'][string]
  disabled: boolean
  onSend: (text: string) => void
  children?: React.ReactNode
}) {
  const [text, setText] = useState('')
  useEffect(() => { setText('') }, [answer?.at])

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.prompt}>{prompt}</div>
      {children}
      {answer ? (
        <div className={`${styles.verdict} ${answer.points > 0 ? styles.verdictGood : answer.points < 0 ? styles.verdictBad : ''}`}>
          «{answer.text}» — {answer.verdict}
          {answer.points !== 0 && ` (${answer.points > 0 ? '+' : ''}${answer.points})`}
        </div>
      ) : (
        <form className={styles.row} onSubmit={e => { e.preventDefault(); if (text.trim()) onSend(text) }}>
          <input className={styles.input} value={text} disabled={disabled}
            onChange={e => setText(e.target.value)} placeholder="Ответ" />
          <button className={styles.btnPrimary} type="submit" disabled={disabled || !text.trim()}>
            Отправить
          </button>
        </form>
      )}
      <span className={styles.hint}>{channel === 'gyulhap' ? 'три номера или gyul' : ''}</span>
    </div>
  )
}

export default function ChannelHoppingClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<ChView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [contentText, setContentText] = useState('')
  const [now, setNow] = useState(Date.now())

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/channelhopping/${slug}`)
    if (res.ok) setView(await res.json())
  }, [slug])

  useEffect(() => {
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 200)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [load])

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/channelhopping/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: ChView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as ChView)
    return true
  }

  const left = view.roundEndsAt ? Math.max(0, view.roundEndsAt - now) : 0
  const canAnswer = view.isDuelist && view.started && !view.finished && view.round != null
  const send = (channel: Channel) => (text: string) => act('answer', { channel, text })

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
            {!view.started && 'Подготовка'}
            {view.started && !view.finished && `Раунд ${view.round ?? '-'} из 18`}
            {view.finished && 'Завершён'}
          </span>
          <span className={styles.score}>
            {[view.ec, view.opponent].filter(Boolean).map(p => (
              <span key={p} className={p === username ? styles.scoreMe : ''}>
                {p}: {view.points[p!] ?? 0}
              </span>
            ))}
          </span>
          {view.started && !view.finished && (
            <span className={`${styles.deadline} ${left < 15000 ? styles.deadlineLow : ''}`}>
              {Math.floor(left / 1000)} с
            </span>
          )}
        </div>

        {view.winner && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>🏆 Победа: {view.winner}</div>
            <p className={styles.hint}>
              Схватки Black and White: {view.bwBattles.map(b =>
                `р${b.round} ${Object.values(b.played).join(':')}${b.winner ? ` → ${b.winner}` : ' ничья'}`).join(' · ')}
            </p>
          </div>
        )}

        {canAnswer && (
          <div className={styles.grid}>
            <ChannelCard channel="five" title="FIVE" disabled={busy}
              prompt={(view.prompts.five ?? []).join(' · ') || 'нет задания'}
              answer={view.myAnswers.five} onSend={send('five')} />

            <ChannelCard channel="integer" title="INTEGER" disabled={busy}
              prompt={view.prompts.integer ?? 'нет задания'}
              answer={view.myAnswers.integer} onSend={send('integer')} />

            <ChannelCard channel="animal" title="ANIMAL" disabled={busy}
              prompt={view.prompts.animal ?? 'нет задания'}
              answer={view.myAnswers.animal} onSend={send('animal')} />

            <ChannelCard channel="collection" title="COLLECTION" disabled={busy}
              prompt={view.prompts.collection ?? 'нет категории'}
              answer={view.myAnswers.collection} onSend={send('collection')} />

            <ChannelCard channel="gyulhap" title="GYUL HAP" disabled={busy}
              prompt="Назовите хап или gyul"
              answer={view.myAnswers.gyulhap} onSend={send('gyulhap')}>
              {view.prompts.board && (
                <div className={styles.board}>
                  {view.prompts.board.map((card, i) => <HapCard key={i} card={card} index={i} />)}
                </div>
              )}
            </ChannelCard>

            <div className={styles.card}>
              <div className={styles.cardTitle}>BLACK AND WHITE</div>
              <div className={styles.prompt}>
                {view.prompts.bwDue ? 'Выставьте плитку' : 'В этом раунде плитка не нужна'}
              </div>
              <div className={styles.tiles}>
                {view.myTiles.map(tile => (
                  <button key={tile}
                    className={`${styles.tile} ${tile % 2 === 0 ? styles.tileBlack : styles.tileWhite}`}
                    disabled={busy || !view.prompts.bwDue || !!view.myAnswers.bw}
                    onClick={() => act('answer', { channel: 'bw', text: String(tile) })}>
                    {tile}
                  </button>
                ))}
              </div>
              {view.myAnswers.bw && (
                <div className={styles.verdict}>{view.myAnswers.bw.verdict}</div>
              )}
              <p className={styles.hint}>
                Схваток сыграно: {view.bwBattles.length}. Победитель забирает 8 очков.
              </p>
            </div>
          </div>
        )}

        {view.isDuelist && !view.started && (
          <p className={styles.hint}>Ждём, пока ведущий начнёт игру. Правила ниже.</p>
        )}

        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            {!view.started && (
              <>
                <div className={styles.row}>
                  <select className={styles.input} value={ec} onChange={e => setEc(e.target.value)}>
                    <option value="">Кандидат на выбывание</option>
                    {roster.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                    <option value="">Оппонент (преимущество)</option>
                    {roster.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button className={styles.btn} disabled={busy}
                    onClick={() => act('roles', { ec, opponent, advantage: opponent })}>
                    Назначить
                  </button>
                </div>
                <p className={styles.hint}>
                  Задания загружаются одним JSON: five (18 штук), integer (18), animal (18) и collections (3).
                  Доски Gyul Hap и Black and White считает сам движок.
                </p>
                <textarea className={styles.input} rows={6} value={contentText}
                  onChange={e => setContentText(e.target.value)}
                  placeholder='{"five":[{"clues":["a","b"],"answer":"house"}],"integer":[{"question":"...","answer":42}],"animal":[{"question":"...","answers":["кот"]}],"collections":[{"category":"...","accepted":["..."]}]}' />
                <div className={styles.row}>
                  <button className={styles.btn} disabled={busy || !contentText.trim()}
                    onClick={() => {
                      try {
                        act('content', { content: JSON.parse(contentText) })
                      } catch {
                        setError('JSON не разобрался')
                      }
                    }}>
                    Загрузить задания
                  </button>
                  <button className={styles.btnPrimary} disabled={busy || !view.contentReady || !view.ec}
                    onClick={() => act('start')}>
                    Начать 27 минут
                  </button>
                </div>
                <p className={styles.hint}>
                  Задания {view.contentReady ? 'загружены' : 'ещё не загружены'} ·
                  игроки {view.ec && view.opponent ? 'назначены' : 'не назначены'}
                </p>
              </>
            )}
            {view.started && !view.finished && (
              <button className={styles.btn} disabled={busy} onClick={() => act('finish')}>
                Закончить сейчас
              </button>
            )}
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить весь DM?')) act('reset') }}>
              Сбросить
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={CHANNEL_HOPPING_RULES} />

        {view.log.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ход игры</div>
            <div className={styles.log}>
              {view.log.map((e, i) => <div key={i}>{e.text}</div>)}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
