'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { LbView, Category } from '@/lib/letterbox'
import styles from './letterbox.module.css'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const POLL_MS = 2000

interface Props {
  slug: string
  initialView: LbView
  username: string
  role: Role
  roster: string[]
  seasonSlug: string
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

export default function LetterboxClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<LbView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [word, setWord] = useState('')
  const [guess, setGuess] = useState('')
  const [discard, setDiscard] = useState('')
  const [lastChance, setLastChance] = useState<string[]>([])
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/letterbox/${slug}`)
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
    const res = await fetch(`/api/letterbox/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: LbView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as LbView)
    return true
  }

  const myTurn = view.turn === username
  const iPick = view.pending?.waitingOn === username
  const rival = view.isDuelist
    ? (username === view.ec ? view.opponent : view.ec)
    : null
  const takenByOpponent = view.pending?.takenByOpponent ?? null

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <Link href="/" className={styles.back}>← Главная</Link>
        <div className={styles.navTitle}>{view.name}</div>
        <div className={styles.navUser}>{username}</div>
      </nav>

      <main className={styles.content}>
        {/* status strip */}
        <div className={styles.statusRow}>
          <span className={styles.phaseTag}>
            {view.phase === 'setup' && 'Настройка'}
            {view.phase === 'hold1' && 'Удержание 1'}
            {view.phase === 'hold2' && 'Удержание 2'}
            {view.phase === 'live' && 'Игра идёт'}
            {view.phase === 'finished' && 'Завершена'}
          </span>
          {view.ec && view.opponent && (
            <span className={styles.roles}>
              Проигравший: <strong>{view.ec}</strong> · Оппонент: <strong>{view.opponent}</strong>
            </span>
          )}
          {view.deadline && view.deadlineFor && (
            <span className={styles.deadline}>
              Ход за {view.deadlineFor}: <Countdown deadline={view.deadline} />
            </span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner}</strong></div>
        )}

        {/* admin setup */}
        {isAdmin && view.phase === 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Роли</div>
            <div className={styles.row}>
              <select className={styles.input} value={ec} onChange={e => setEc(e.target.value)}>
                <option value="">Проигравший (EC)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={opponent} onChange={e => setOpponent(e.target.value)}>
                <option value="">Оппонент (ходит первым)</option>
                {roster.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btn} disabled={busy} onClick={() => act('roles', { ec, opponent })}>
                Назначить
              </button>
            </div>
            <button className={styles.btnPrimary} disabled={busy || !view.ec || !view.opponent}
              onClick={() => act('deal')}>
              Раздать стартовые руки
            </button>
          </div>
        )}

        {/* hands */}
        {view.isDuelist && view.myHand && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваша рука</div>
            <div className={styles.letters}>
              {view.myHand.map(l => (
                <span key={l} className={styles.letter}>{l}</span>
              ))}
            </div>
            {rival && (
              <p className={styles.hint}>
                У {rival} осталось букв: <strong>{view.handSizes[rival] ?? 0}</strong>
                {(view.lostLetters[rival] ?? []).length > 0 &&
                  ` · вышли из игры: ${(view.lostLetters[rival] ?? []).join(', ')}`}
              </p>
            )}
          </div>
        )}

        {!view.isDuelist && view.myLetter && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваша буква</div>
            <div className={styles.letters}><span className={styles.letter}>{view.myLetter}</span></div>
            <p className={styles.hint}>
              Её нет ни у одного из дуэлянтов. В следующем Main Match она станет вашей личностью,
              так что делитесь ей только с теми, кому доверяете.
            </p>
          </div>
        )}

        {/* hold phase */}
        {view.isDuelist && (view.phase === 'hold1' || view.phase === 'hold2') && view.myHand && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {view.phase === 'hold1' ? 'Первая замена' : 'Вторая замена'}: что оставляем?
            </div>
            <div className={styles.letters}>
              {view.myHand.map(l => (
                <button key={l}
                  className={`${styles.letterBtn} ${held.includes(l) ? styles.letterHeld : ''}`}
                  onClick={() => setHeld(h => h.includes(l) ? h.filter(x => x !== l) : [...h, l])}>
                  {l}
                </button>
              ))}
            </div>
            <p className={styles.hint}>Невыбранные буквы заменятся новыми из оставшегося пула.</p>
            <button className={styles.btnPrimary} disabled={busy}
              onClick={async () => { if (await act('hold', { letters: held })) setHeld([]) }}>
              Подтвердить
            </button>
          </div>
        )}

        {/* word on the table */}
        {view.pending && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Слово на столе: {view.pending.word.toUpperCase()}</div>
            <p className={styles.hint}>
              Подал: {view.pending.submitter} · выбирает: {view.pending.waitingOn}
              {view.pending.opponentPicked && ' · соперник уже выбрал'}
            </p>
            {iPick && (
              <div className={styles.row}>
                {(['none', 'one', 'any'] as Category[]).map(c => (
                  <button key={c} className={styles.btn}
                    disabled={busy || takenByOpponent === c}
                    title={takenByOpponent === c ? 'Забрано соперником' : ''}
                    onClick={() => act('category', { category: c })}>
                    {c === 'none' ? 'None (ни одной)' : c === 'one' ? 'One (ровно одна)' : 'Any (хотя бы одна)'}
                  </button>
                ))}
              </div>
            )}
            {view.pending.myPick && (
              <p className={styles.hint}>Ваш выбор: <strong>{view.pending.myPick}</strong></p>
            )}
          </div>
        )}

        {/* turn actions */}
        {view.isDuelist && view.phase === 'live' && myTurn && !view.pending && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваш ход</div>

            <div className={styles.actionBlock}>
              <div className={styles.actionTitle}>Подать слово</div>
              <div className={styles.row}>
                <input className={styles.input} value={word} placeholder="от 3 букв, словарь Scrabble"
                  onChange={e => setWord(e.target.value)} />
                <button className={styles.btn} disabled={busy}
                  onClick={async () => { if (await act('word', { word })) setWord('') }}>
                  Подать
                </button>
              </div>
            </div>

            <div className={styles.actionBlock}>
              <div className={styles.actionTitle}>Назвать букву соперника</div>
              <div className={styles.row}>
                <select className={styles.input} value={guess} onChange={e => setGuess(e.target.value)}>
                  <option value="">Буква</option>
                  {ALPHABET.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select className={styles.input} value={discard} onChange={e => setDiscard(e.target.value)}>
                  <option value="">Чем платите при промахе</option>
                  {(view.myHand ?? []).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button className={styles.btn} disabled={busy || !guess || !discard}
                  onClick={async () => { if (await act('guess', { letter: guess, discard })) { setGuess(''); setDiscard('') } }}>
                  Назвать
                </button>
              </div>
              <p className={styles.hint}>Промах стоит вам одной буквы, и она откроется сопернику.</p>
            </div>

            <div className={styles.actionBlock}>
              <div className={styles.actionTitle}>Last Chance</div>
              <div className={styles.letters}>
                {ALPHABET.map(l => (
                  <button key={l}
                    className={`${styles.letterBtn} ${lastChance.includes(l) ? styles.letterHeld : ''}`}
                    onClick={() => setLastChance(h => h.includes(l) ? h.filter(x => x !== l) : [...h, l])}>
                    {l}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>
                Назовите всю оставшуюся руку соперника ({rival ? view.handSizes[rival] ?? 0 : 0} букв).
                Ошибка в любой букве — поражение.
              </p>
              <button className={styles.btnDanger} disabled={busy || lastChance.length === 0}
                onClick={() => { if (confirm('Идти ва-банк? Ошибка означает поражение.')) act('lastchance', { letters: lastChance }) }}>
                Ва-банк ({lastChance.join('') || '—'})
              </button>
            </div>
          </div>
        )}

        {view.isDuelist && view.phase === 'live' && !myTurn && !iPick && (
          <p className={styles.waiting}>Ход соперника…</p>
        )}

        {/* admin tools */}
        {isAdmin && view.phase !== 'setup' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <div className={styles.row}>
              <button className={styles.btn} disabled={busy || view.phase !== 'live'} onClick={() => act('skip')}>
                Пропустить текущий ход
              </button>
              <button className={styles.btnDanger} disabled={busy}
                onClick={() => { if (confirm('Сбросить игру полностью?')) act('reset') }}>
                Начать заново
              </button>
            </div>
            {view.allHands && (
              <p className={styles.hint}>
                Руки: {Object.entries(view.allHands).map(([p, h]) => `${p}: ${h.join('')}`).join(' · ')}
              </p>
            )}
            {view.allObserverLetters && Object.keys(view.allObserverLetters).length > 0 && (
              <p className={styles.hint}>
                Буквы зрителей: {Object.entries(view.allObserverLetters).map(([p, l]) => `${p}: ${l}`).join(' · ')}
              </p>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {/* used words + log */}
        <div className={styles.twoCol}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Использованные слова ({view.usedWords.length})</div>
            {view.usedWords.length === 0
              ? <p className={styles.hint}>Пока ни одного</p>
              : <p className={styles.words}>{view.usedWords.map(w => w.toUpperCase()).join(', ')}</p>}
          </div>

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
        </div>
      </main>
    </div>
  )
}
