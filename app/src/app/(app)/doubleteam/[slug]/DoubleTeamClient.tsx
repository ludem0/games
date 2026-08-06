'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { DtView } from '@/lib/doubleTeam'
import type { Sign, Colour } from '@/lib/doubleTeamScoring'
import styles from './doubleteam.module.css'

const POLL_MS = 5000
const COLOURS: { id: Colour; label: string; hex: string }[] = [
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'yellow', label: 'Yellow', hex: '#facc15' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
]

interface Props {
  slug: string
  initialView: DtView
  username: string
  role: Role
}

/** The symbol as drawn on the grid: a ring for O, a cross for X. */
function Symbol({ sign, colour }: { sign: Sign; colour: Colour }) {
  const hex = COLOURS.find(c => c.id === colour)?.hex ?? '#888'
  return sign === 'O'
    ? <span className={styles.ring} style={{ borderColor: hex }} />
    : <span className={styles.cross} style={{ color: hex }}>✕</span>
}

export default function DoubleTeamClient({ slug, initialView, username, role }: Props) {
  const [view, setView] = useState<DtView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sign, setSign] = useState<Sign | ''>('')
  const [colour, setColour] = useState<Colour | ''>('')
  const [hours, setHours] = useState(24)
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [guess, setGuess] = useState<Record<string, string>>({})
  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/doubleteam/${slug}`)
    if (res.ok) setView(await res.json())
  }, [slug])

  useEffect(() => {
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError('')
    const res = await fetch(`/api/doubleteam/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: DtView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as DtView)
    return true
  }

  const lastResolved = [...view.rounds].reverse().find(r => r.status === 'resolved')
  const shown = lastResolved
  const letterOf = (u: string) => view.players.find(p => p.username === u)?.letter ?? '?'
  const lastColour = view.myHistory[0]?.colour
  const lastTwoSigns = view.myHistory.slice(0, 2).map(p => p.sign)
  const signBlocked = (s: Sign) => lastTwoSigns.length === 2 && lastTwoSigns.every(x => x === s)

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navTitle}>{view.name}</div>
        <div className={styles.navUser}>{username}</div>
      </nav>

      <main className={styles.content}>
        <div className={styles.statusRow}>
          <span className={styles.tag}>
            {view.status === 'setup' ? 'Настройка' : view.status === 'active' ? 'Идёт' : 'Завершён'}
          </span>
          {view.openRoundNumber && (
            <span className={styles.muted}>
              Раунд {view.openRoundNumber} · подали {view.submittedCount} из {view.players.length}
              {view.openDeadline && ` · до ${new Date(view.openDeadline).toLocaleString('ru-RU')}`}
            </span>
          )}
          {view.winners.length > 0 && (
            <span className={styles.winner}>🏆 {view.winners.join(', ')}</span>
          )}
        </div>

        {/* grid */}
        {view.players.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Сетка{shown ? ` · итог раунда ${shown.number}` : ''}
            </div>
            <div className={styles.grid}>
              {view.players.map(p => {
                const pick = shown?.picks[p.username]
                const removed = shown?.outcome?.removed.includes(p.username)
                const scored = shown?.outcome?.scored.includes(p.username)
                return (
                  <div key={p.username}
                    className={`${styles.cell} ${removed ? styles.cellRemoved : ''} ${scored ? styles.cellScored : ''}`}>
                    <div className={styles.cellSymbol}>
                      {pick ? <Symbol sign={pick.sign} colour={pick.colour} /> : <span className={styles.empty} />}
                    </div>
                    <div className={styles.cellLetter}>{p.letter}</div>
                    <div className={styles.cellPoints}>{view.points[p.username] ?? 0}</div>
                    {isAdmin && <div className={styles.cellName}>{p.username}</div>}
                  </div>
                )
              })}
            </div>
            {shown?.outcome && (
              <p className={styles.muted}>
                {shown.outcome.removedLines.length > 0 && `Выбыли: ${shown.outcome.removedLines.join(', ')}. `}
                {shown.outcome.signCounts.X} X против {shown.outcome.signCounts.O} O, значит нужен{' '}
                {shown.outcome.rule === 'least' ? 'самый редкий' : shown.outcome.rule === 'middle' ? 'средний' : 'самый частый'}
                {' '}цвет: <strong>{shown.outcome.targetColour ?? 'никакой'}</strong>
                {shown.outcome.inverted && '. Набравших было бы больше шести, поэтому очки ушли остальным'}
              </p>
            )}
          </div>
        )}

        {view.isPlayer && view.myNeighbours.length > 0 && (
          <p className={styles.muted}>
            Свободно общаетесь с: {view.myNeighbours.map(letterOf).join(', ')} (ваша строка и столбец)
          </p>
        )}

        {/* pick */}
        {view.isPlayer && view.openRoundNumber && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Раунд {view.openRoundNumber}: ваш символ</div>
            {view.myPick ? (
              <p className={styles.chosen}>
                Выбрано: <Symbol sign={view.myPick.sign} colour={view.myPick.colour} />
                <span className={styles.muted}> можно поменять до конца раунда</span>
              </p>
            ) : <p className={styles.muted}>Ещё не подано</p>}

            <div className={styles.row}>
              {(['O', 'X'] as Sign[]).map(s => (
                <button key={s} disabled={busy || signBlocked(s)}
                  title={signBlocked(s) ? 'Этот знак был два раунда подряд' : ''}
                  className={`${styles.choice} ${sign === s ? styles.choiceOn : ''}`}
                  onClick={() => setSign(s)}>{s}</button>
              ))}
            </div>
            <div className={styles.row}>
              {COLOURS.map(c => (
                <button key={c.id} disabled={busy || lastColour === c.id}
                  title={lastColour === c.id ? 'Этот цвет был в прошлом раунде' : ''}
                  className={`${styles.choice} ${colour === c.id ? styles.choiceOn : ''}`}
                  style={{ borderColor: c.hex, color: c.hex }}
                  onClick={() => setColour(c.id)}>{c.label}</button>
              ))}
            </div>
            <div className={styles.row}>
              <button className={styles.btnPrimary} disabled={busy || !sign || !colour}
                onClick={() => act('pick', { sign, colour })}>Подать</button>
              <button className={styles.btn} disabled={busy || view.iAmImmune}
                onClick={() => { if (confirm('Купить иммунитет за 3 псигема?')) act('immunity') }}>
                {view.iAmImmune ? 'Иммунитет куплен' : 'Иммунитет (3 Ψ)'}
              </button>
            </div>
            <p className={styles.muted}>
              Нельзя повторять цвет два раунда подряд и знак три раунда подряд. Не подадите
              вовремя, символ назначится случайно.
            </p>
          </div>
        )}

        {/* paid message */}
        {view.isPlayer && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Сообщение игроку</div>
            <div className={styles.row}>
              <select className={styles.input} value={to} onChange={e => setTo(e.target.value)}>
                <option value="">Кому</option>
                {view.players.filter(p => p.username !== username).map(p => (
                  <option key={p.username} value={p.username}>
                    {p.letter}{view.myNeighbours.includes(p.username) ? ' (бесплатно)' : ' (1 Ψ)'}
                  </option>
                ))}
              </select>
              <input className={styles.input} maxLength={400} value={text} placeholder="до 400 символов"
                onChange={e => setText(e.target.value)} />
              <button className={styles.btn} disabled={busy || !to || !text}
                onClick={async () => { if (await act('message', { to, text })) setText('') }}>
                Отправить
              </button>
            </div>
            <p className={styles.muted}>
              Внутри своей строки и столбца бесплатно, всем остальным за 1 псигем. Переписка
              появится в чатах сезона.
            </p>
          </div>
        )}

        {/* opal challenge */}
        {view.players.length > 0 && view.status !== 'finished' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Opal Challenge: угадать личности</div>
            <div className={styles.guessGrid}>
              {view.players.map(p => (
                <label key={p.username} className={styles.guessRow}>
                  <span>{isAdmin ? p.username : p.letter}</span>
                  <input className={styles.input} maxLength={1}
                    value={guess[p.username] ?? view.myOpalGuess?.[p.username] ?? ''}
                    onChange={e => setGuess(g => ({ ...g, [p.username]: e.target.value.toUpperCase() }))} />
                </label>
              ))}
            </div>
            <button className={styles.btn} disabled={busy}
              onClick={() => act('opal', { guess: { ...view.myOpalGuess, ...guess } })}>
              {view.myOpalGuess ? 'Обновить догадку' : 'Отправить догадку'}
            </button>
            <p className={styles.muted}>
              Опал получит только тот, кто угадает всех и окажется единственным. Если угадавших
              несколько, каждый получит по псигему. Подать можно, пока никто не набрал 5 очков.
            </p>
          </div>
        )}

        {/* admin */}
        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <div className={styles.row}>
              <button className={styles.btn} disabled={busy || view.players.length > 0}
                onClick={() => act('grid')}>Составить сетку</button>
              <input className={styles.input} type="number" min={1} value={hours}
                onChange={e => setHours(Number(e.target.value))} style={{ width: 90 }} />
              <button className={styles.btn} disabled={busy || !!view.openRoundNumber}
                onClick={() => act('open', { hours })}>Открыть раунд (часов)</button>
              <button className={styles.btnPrimary} disabled={busy || !view.openRoundNumber}
                onClick={() => act('close')}>Подвести итог раунда</button>
              <button className={styles.btnDanger} disabled={busy}
                onClick={() => { if (confirm('Сбросить матч полностью?')) act('reset') }}>Сбросить</button>
            </div>
            {view.opalCorrectCount != null && (
              <p className={styles.muted}>Догадок по личностям верных: {view.opalCorrectCount}</p>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {/* history */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход матча</div>
          <div className={styles.log}>
            {view.log.length === 0 && <p className={styles.muted}>Пусто</p>}
            {view.log.map((e, i) => (
              <div key={i} className={styles.logRow}>
                <span className={styles.logTime}>
                  {new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
