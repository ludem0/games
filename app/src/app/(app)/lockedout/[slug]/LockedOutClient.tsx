'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { LoView, Colour } from '@/lib/lockedOut'
import RulesCard from '@/components/RulesCard'
import { LOCKED_OUT_RULES } from './rules'
import styles from './vault.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 5000
const DIGITS = [1, 2, 3, 4]

const BULB: Record<Colour, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e',
  magenta: '#d946ef', yellow: '#eab308', cyan: '#06b6d4',
  white: '#f8fafc', black: '#0b0b12',
}

interface Props {
  slug: string
  initialView: LoView
  username: string
  role: Role
  roster: string[]
}


export default function LockedOutClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<LoView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [safe, setSafe] = useState('')
  const [mode, setMode] = useState<'solo' | 'dual'>('solo')
  const [left, setLeft] = useState<number | null>(null)
  const [right, setRight] = useState<number | null>(null)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [partner, setPartner] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/lockedout/${slug}`)
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
    const res = await fetch(`/api/lockedout/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: LoView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as LoView)
    return true
  }

  const others = view.players.filter(p => p !== username && !view.escaped.includes(p))

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
            {view.phase === 'live' && `Раунд ${view.round}`}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          <span className={styles.roles}>
            Ваше: золото {view.myGold}, ключей {view.myKeys}, карт {view.myHand.length}, сейфов вскрыто {view.myOpened}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>До дедлайна: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.escaped.length > 0 && (
          <div className={styles.winner}>Вышли из хранилища: <strong>{view.escaped.join(', ')}</strong></div>
        )}

        {view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Сейфы</div>
            <div className={styles.safes}>
              {view.safes.map(item => (
                <button key={item.letter}
                  className={`${styles.safe} ${item.open ? styles.safeOpen : ''} ${safe === item.letter ? styles.safeChosen : ''}`}
                  disabled={item.open || !view.amPlaying}
                  onClick={() => setSafe(item.letter)}>
                  <div className={styles.safeLetter}>{item.letter}</div>
                  <div className={styles.safeCode}>
                    {item.lock ? `${item.lock.left}-${item.lock.right}` : item.open ? 'делят' : 'закрыт'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {view.amPlaying && view.phase === 'live' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Попытка на сейф {safe || '—'}</div>
            <div className={styles.row}>
              <button className={`${styles.btn} ${mode === 'solo' ? styles.toggle : ''}`}
                onClick={() => setMode('solo')}>В одиночку</button>
              <button className={`${styles.btn} ${mode === 'dual' ? styles.toggle : ''}`}
                onClick={() => setMode('dual')}>В паре</button>
            </div>

            {mode === 'solo' ? (
              <>
                <div className={styles.row}>
                  <span>Левая:</span>
                  {DIGITS.map(d => (
                    <button key={d} className={`${styles.cardBtn} ${left === d ? styles.cardChosen : ''}`}
                      onClick={() => setLeft(d)}>{d}</button>
                  ))}
                </div>
                <div className={styles.row}>
                  <span>Правая:</span>
                  {DIGITS.map(d => (
                    <button key={d} className={`${styles.cardBtn} ${right === d ? styles.cardChosen : ''}`}
                      onClick={() => setRight(d)}>{d}</button>
                  ))}
                </div>
                <button className={styles.btnPrimary}
                  disabled={busy || !safe || left == null || right == null}
                  onClick={() => act('solo', { safe, left, right })}>
                  Ввести код
                </button>
              </>
            ) : (
              <>
                <div className={styles.row}>
                  <button className={`${styles.btn} ${side === 'left' ? styles.toggle : ''}`}
                    onClick={() => setSide('left')}>Беру левую</button>
                  <button className={`${styles.btn} ${side === 'right' ? styles.toggle : ''}`}
                    onClick={() => setSide('right')}>Беру правую</button>
                  {DIGITS.map(d => (
                    <button key={d} className={`${styles.cardBtn} ${left === d ? styles.cardChosen : ''}`}
                      onClick={() => setLeft(d)}>{d}</button>
                  ))}
                </div>
                <div className={styles.row}>
                  <select className={styles.input} value={partner} onChange={e => setPartner(e.target.value)}>
                    <option value="">Напарник</option>
                    {others.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button className={styles.btnPrimary}
                    disabled={busy || !safe || left == null || !partner}
                    onClick={() => act('dual', { safe, side, value: left, partner })}>
                    Записаться в пару
                  </button>
                </div>
              </>
            )}

            <div className={styles.hand}>
              {view.myHand.map((value, i) => (
                <span key={`${value}-${i}`} className={styles.cardBtn}>{value}</span>
              ))}
            </div>
            {view.myAttempts && (
              <p className={styles.hint}>
                Заявлено:
                {view.myAttempts.solo && ` в одиночку ${view.myAttempts.solo.safe} (${view.myAttempts.solo.left}-${view.myAttempts.solo.right})`}
                {view.myAttempts.dual && ` в паре ${view.myAttempts.dual.safe}, ${view.myAttempts.dual.side === 'left' ? 'левая' : 'правая'} ${view.myAttempts.dual.value} с ${view.myAttempts.dual.partner}`}
              </p>
            )}
          </div>
        )}

        {view.myBargains.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Делёж</div>
            {view.myBargains.map(bargain => (
              <div key={bargain.safe} className={styles.row}>
                <span>Сейф {bargain.safe} с {bargain.players.filter(p => p !== username).join(', ')}:</span>
                {[0, 1, 2].map(gold => [0, 1].map(keys => (
                  <button key={`${gold}-${keys}`} className={styles.btn} disabled={busy}
                    onClick={() => act('claim', { safe: bargain.safe, gold, keys })}>
                    {gold} зол. {keys} кл.
                  </button>
                )))}
                {bargain.claims[username] && (
                  <span className={styles.hint}>
                    заявлено {bargain.claims[username].gold} золота и {bargain.claims[username].keys} ключа
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {view.myFlashes.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши лампы</div>
            <div className={styles.lamps}>
              {[...view.myFlashes].reverse().map((item, i) => (
                <span key={i} className={styles.lamp}>
                  <span className={styles.bulb} style={{ background: BULB[item.colour] }} />
                  {item.safe} · {item.guess.left}-{item.guess.right} · раунд {item.round}
                  {item.shared && ' · в паре'}
                </span>
              ))}
            </div>
          </div>
        )}

        {view.players.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Кто где</div>
            <div className={styles.counts}>
              {view.standings.map(row => (
                <span key={row.player}>
                  {row.player}: {row.escaped ? 'вышел' : 'в хранилище'} · карт {row.cards}
                  {row.gold != null && ` · золото ${row.gold}, ключей ${row.keys}`}
                </span>
              ))}
            </div>
            {view.payout && (
              <p className={styles.hint}>
                Начислено: {Object.entries(view.payout.psigems).map(([p, v]) => `${p} +${v} Ψ`).join(', ') || 'ничего'}
                {' · жетоны: '}{Object.keys(view.payout.tol).join(', ') || 'нет'}
                {' · опал: '}{Object.keys(view.payout.opals).join(', ') || 'нет'}
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
                <button className={styles.btnPrimary} disabled={busy || picked.length < 2}
                  onClick={() => act('start', { players: picked })}>
                  Запереть {picked.length} человек в хранилище
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

        <RulesCard sections={LOCKED_OUT_RULES} />

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
