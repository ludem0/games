'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { TwView, ModuleId } from '@/lib/tugOfWar'
import RulesCard from '@/components/RulesCard'
import { TUG_RULES } from './rules'
import styles from './tug.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 2000
const MODULES: ModuleId[] = ['rope', 'race', 'collation', 'clock', 'path', 'conker', 'tower']
const NAMES: Record<ModuleId, string> = {
  rope: 'Канат', race: 'Гонка', collation: 'Сбор', clock: 'Часы',
  path: 'Путь', conker: 'Каштаны', tower: 'Башня',
}

interface Props {
  slug: string
  initialView: TwView
  username: string
  role: Role
  roster: string[]
}


export default function TugClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<TwView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [module, setModule] = useState<ModuleId | null>(null)
  const [cards, setCards] = useState<number[]>([])
  const [tiles, setTiles] = useState<number[]>([])
  const [option, setOption] = useState('A')
  const [block, setBlock] = useState<ModuleId | ''>('')
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [first, setFirst] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/tugofwar/${slug}`)
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
    const res = await fetch(`/api/tugofwar/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: TwView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as TwView)
    return true
  }

  const myTurn = view.turn === username && view.phase === 'live'
  const m = view.modules
  const side = view.mySide ?? 'red'
  const rivalSide = side === 'red' ? 'blue' : 'red'

  const state = (id: ModuleId): string => {
    if (view.won[id]) return `взял ${view.won[id]}`
    switch (id) {
      case 'rope': return `вы ${m.rope.spots[side]}, соперник ${m.rope.spots[rivalSide]} · очки ${m.rope.points[side]}:${m.rope.points[rivalSide]}`
      case 'race': return `вы ${m.race.at[side]}, соперник ${m.race.at[rivalSide]} · очки ${m.race.points[side]}:${m.race.points[rivalSide]}`
      case 'collation': return `в куче ${m.collation.pile} · у вас ${m.collation.held[side]}, у соперника ${m.collation.held[rivalSide]}`
      case 'clock': return `${m.clock.filled} из 8${m.clock.owner ? `, цвет ${m.clock.owner === side ? 'ваш' : 'соперника'}` : ''}`
      case 'path': return `очки ${m.path.points[side]}:${m.path.points[rivalSide]}`
      case 'conker': return `вы ${m.conker.height[side]}, соперник ${m.conker.height[rivalSide]} · очки ${m.conker.points[side]}:${m.conker.points[rivalSide]}`
      default: return `вы ${m.tower.height[side]}, соперник ${m.tower.height[rivalSide]}`
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
            {view.phase === 'live' && (myTurn ? 'Ваш ход' : `Ход ${view.turn}`)}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            Карт на руках: {Object.entries(view.handSizes).map(([p, n]) => `${p} ${n}`).join(' · ')}
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
            <div className={styles.cardTitle}>Модули</div>
            <div className={styles.modules}>
              {MODULES.map(id => {
                const won = !!view.won[id]
                const shut = !won && myTurn && !view.legal.includes(id)
                return (
                  <button key={id}
                    className={`${styles.module} ${module === id ? styles.moduleChosen : ''} ${won ? styles.moduleWon : ''} ${shut ? styles.moduleShut : ''}`}
                    disabled={won || shut || !myTurn}
                    onClick={() => setModule(id)}>
                    <div className={styles.moduleName}>{NAMES[id]}</div>
                    <div className={styles.moduleState}>{state(id)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {view.isDuelist && view.phase === 'live' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши карты</div>
            <div className={styles.row}>
              {view.myHand.map((card, i) => (
                <button key={`${card}-${i}`}
                  className={`${styles.cardBtn} ${cards.includes(card) ? styles.cardChosen : ''}`}
                  onClick={() => setCards(list =>
                    list.includes(card) ? list.filter(c => c !== card) : [...list, card])}>
                  {card}
                </button>
              ))}
            </div>

            {module === 'tower' && (
              <div className={styles.row}>
                <span>Награда:</span>
                {['A', 'B', 'C'].map(item => (
                  <button key={item} className={`${styles.btn} ${option === item ? styles.toggle : ''}`}
                    onClick={() => setOption(item)}>{item}</button>
                ))}
              </div>
            )}

            {module === 'path' && (
              <>
                <div className={styles.board}>
                  {m.path.tiles.map((tile, i) => (
                    <div key={i}
                      className={`${styles.tile} ${tile === 'red' ? styles.tileRed : tile === 'blue' ? styles.tileBlue : styles.tileGrey} ${tiles.includes(i) ? styles.tilePicked : ''}`}
                      onClick={() => setTiles(list =>
                        list.includes(i) ? list.filter(x => x !== i) : [...list, i])} />
                  ))}
                </div>
                <p className={styles.hint}>Выбрано клеток: {tiles.length}</p>
              </>
            )}

            <div className={styles.row}>
              <select className={styles.input} value={block}
                onChange={e => setBlock(e.target.value as ModuleId | '')}>
                <option value="">Без блокировки</option>
                {MODULES.filter(id => !view.won[id]).map(id => (
                  <option key={id} value={id}>Закрыть сопернику {NAMES[id]}</option>
                ))}
              </select>
              <button className={styles.btnPrimary}
                disabled={busy || !myTurn || !module || cards.length === 0}
                onClick={async () => {
                  const ok = await act('turn', {
                    module, cards, option, tiles, block: block || undefined,
                  })
                  if (ok) { setCards([]); setTiles([]); setModule(null); setBlock('') }
                }}>
                Сыграть на модуле {module ? NAMES[module] : ''}
              </button>
            </div>
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

        <RulesCard sections={TUG_RULES} />

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
