'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { CvView, Track } from '@/lib/conveyor'
import RulesCard from '@/components/RulesCard'
import { CONVEYOR_RULES } from './rules'
import styles from './belt.module.css'

const POLL_MS = 2000
const SLOTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
const COLOUR_CLASS: Record<string, string> = {
  red: styles.mRed, blue: styles.mBlue, green: styles.mGreen,
}
const KIND_NAMES: Record<string, string> = {
  single: 'один раз', repeat: 'сколько угодно', degrade: 'дешевеет', compete: 'состязание',
}

interface Props {
  slug: string
  initialView: CvView
  username: string
  role: Role
  roster: string[]
}

export default function ConveyorClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<CvView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loader, setLoader] = useState<(number | null)[]>(initialView.myLoader)
  const [holding, setHolding] = useState<number | null>(null)
  const [slot, setSlot] = useState<string>('A')
  const [machine, setMachine] = useState('')
  const [saleBuyer, setSaleBuyer] = useState('')
  const [salePips, setSalePips] = useState<number[]>([])
  const [sales, setSales] = useState<{ buyer: string; pips: number[] }[]>([])
  const [ec, setEc] = useState('')
  const [opponent, setOpponent] = useState('')
  const [setupJson, setSetupJson] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/conveyor/${slug}`)
    if (res.ok) {
      const next: CvView = await res.json()
      setView(next)
      if (next.myLoader.length > 0) setLoader(current =>
        current.some(v => v != null) ? current : next.myLoader)
    }
  }, [slug])

  useEffect(() => {
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }) }, [view.log.length])

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/conveyor/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: CvView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as CvView)
    return true
  }

  const spare = (() => {
    const left = [...view.myPips]
    for (const value of loader) {
      if (value == null) continue
      const index = left.indexOf(value)
      if (index >= 0) left.splice(index, 1)
    }
    return left
  })()

  function place(position: number) {
    if (holding == null) return
    setLoader(current => current.map((value, i) => (i === position ? holding : value)))
    setHolding(null)
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
            {view.phase === 'loading' && `Раунд ${view.roundNumber}: загрузка ${view.loadStage}/3`}
            {view.phase === 'machines' && 'Расстановка машин и дорожек'}
            {view.phase === 'market' && 'Рынок'}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            Раунды: {[view.ec, view.opponent].filter(Boolean).map(p => `${p} ${view.wins[p!] ?? 0}`).join(' · ')}
          </span>
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner}</strong></div>
        )}

        {view.isDuelist && view.phase === 'loading' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Загрузчик</div>
            <div className={styles.chain}>
              {loader.map((value, position) => (
                <button key={position}
                  className={`${styles.slot} ${value != null ? styles.slotFull : ''}`}
                  onClick={() => place(position)}>
                  {value ?? '·'}
                </button>
              ))}
            </div>
            <div className={styles.position}>1 2 3 4 5 6 7 8 9</div>
            <div className={styles.row}>
              {spare.map((value, i) => (
                <button key={`${value}-${i}`}
                  className={`${styles.cardBtn} ${holding === value ? styles.cardChosen : ''}`}
                  onClick={() => setHolding(value)}>
                  {value}
                </button>
              ))}
            </div>
            <button className={styles.btnPrimary} disabled={busy}
              onClick={() => act('load', { loader })}>
              Сдать загрузчик
            </button>
          </div>
        )}

        {view.machines.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Машины раунда</div>
            <div className={styles.machines}>
              {view.machines.map(item => (
                <button key={item.id}
                  className={`${styles.machine} ${COLOUR_CLASS[item.colour]} ${machine === item.id ? styles.machineChosen : ''}`}
                  onClick={() => setMachine(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
            {view.isDuelist && view.phase === 'machines' && (
              <div className={styles.row}>
                <select className={styles.input} value={slot} onChange={e => setSlot(e.target.value)}>
                  {SLOTS.map(s => (
                    <option key={s} value={s}>
                      {s} · {view.slotColours?.[s] ?? ''}
                    </option>
                  ))}
                </select>
                <button className={styles.btn} disabled={busy || !machine}
                  onClick={() => act('machine', { slot, machine })}>
                  Поставить машину
                </button>
                <span className={styles.hint}>
                  Расставлено: {Object.keys(view.myPlacements).length} из 6
                </span>
              </div>
            )}
          </div>
        )}

        {view.isDuelist && (view.phase === 'machines' || view.phase === 'tracks') && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Дорожки и предметы</div>
            <div className={styles.chain}>
              {view.myLoader.map((value, position) => {
                const track = view.myTracks[position]
                return (
                  <button key={position}
                    className={`${styles.slot} ${styles.slotFull} ${track === 'upper' ? styles.slotUpper : track === 'lower' ? styles.slotLower : ''}`}
                    onClick={() => {
                      const next: Record<number, Track> = { ...view.myTracks }
                      next[position] = track === 'upper' ? 'lower' : 'upper'
                      act('tracks', { tracks: next })
                    }}>
                    {value ?? '·'}
                  </button>
                )
              })}
            </div>
            <p className={styles.hint}>
              Синяя рамка это верхняя дорожка, жёлтая нижняя, по пять мест на каждой.
            </p>
            <div className={styles.row}>
              <button className={styles.btn} disabled={busy}
                onClick={() => {
                  const from = Number(prompt('Поменять местами: первая позиция 1-9') ?? '0') - 1
                  const to = Number(prompt('Вторая позиция 1-9') ?? '0') - 1
                  act('item', { item: '1star', from, to })
                }}>
                Одна звезда: обмен
              </button>
              <button className={styles.btn} disabled={busy}
                onClick={() => {
                  const position = Number(prompt('Какой пип поднять, позиция 1-9') ?? '0') - 1
                  act('item', { item: '2star', position })
                }}>
                Две звезды: плюс один
              </button>
              <button className={styles.btn} disabled={busy}
                onClick={() => {
                  const position = Number(prompt('Какой пип пустить мимо машин, позиция 1-9') ?? '0') - 1
                  act('item', { item: '3star', position })
                }}>
                Три звезды: мимо машин
              </button>
            </div>
          </div>
        )}

        {view.buyers.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Покупатели</div>
            <div className={styles.buyers}>
              {view.buyers.map(item => (
                <div key={item.id} className={styles.buyer}>
                  <strong>{item.id}</strong> · {KIND_NAMES[item.kind]} · {item.price} золота
                  {item.count > 1 && ` · пипов за раз: ${item.count}`}
                  <div className={styles.hint}>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view.isDuelist && view.phase === 'market' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши пипы после конвейера</div>
            <div className={styles.row}>
              {view.myOutput.map((value, i) => (
                <button key={i}
                  className={`${styles.cardBtn} ${salePips.includes(value) ? styles.cardChosen : ''}`}
                  onClick={() => setSalePips(list =>
                    list.includes(value) ? list.filter(v => v !== value) : [...list, value])}>
                  {value}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <select className={styles.input} value={saleBuyer} onChange={e => setSaleBuyer(e.target.value)}>
                <option value="">Покупатель</option>
                {view.buyers.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}
              </select>
              <button className={styles.btn} disabled={!saleBuyer || salePips.length === 0}
                onClick={() => {
                  setSales(list => [...list, { buyer: saleBuyer, pips: salePips }])
                  setSalePips([])
                }}>
                Добавить сделку
              </button>
              <button className={styles.btn} onClick={() => setSales([])}>Очистить</button>
              <button className={styles.btnPrimary} disabled={busy}
                onClick={() => act('sell', { sales })}>
                Сдать продажи
              </button>
            </div>
            <p className={styles.hint}>
              {sales.map(s => `${s.buyer}: ${s.pips.join(', ')}`).join(' · ') || 'сделок пока нет'}
            </p>
          </div>
        )}

        {view.report.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итоги раунда</div>
            {view.report.map((line, i) => <p key={i} className={styles.hint}>{line}</p>)}
            {view.rivalOutput.length > 0 && (
              <p className={styles.hint}>Пипы соперника: {view.rivalOutput.join(', ')}</p>
            )}
          </div>
        )}

        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            {!view.ec ? (
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
            ) : (
              <>
                <p className={styles.hint}>
                  Раунд задаётся JSON: pips из девяти чисел, шесть машин с правилами, цвета мест A-F и покупатели.
                </p>
                <textarea className={styles.input} rows={4} value={setupJson}
                  onChange={e => setSetupJson(e.target.value)} />
                <div className={styles.row}>
                  <button className={styles.btn} disabled={busy || view.phase !== 'setup'}
                    onClick={() => {
                      try {
                        act('startround', { setup: JSON.parse(setupJson) })
                      } catch {
                        setError('JSON раунда не разобрался')
                      }
                    }}>
                    Начать раунд
                  </button>
                  <button className={styles.btn} disabled={busy || view.phase !== 'loading'}
                    onClick={() => act('stage')}>
                    Следующий этап загрузки
                  </button>
                  <button className={styles.btn} disabled={busy || view.phase !== 'machines'}
                    onClick={() => act('process')}>
                    Пропустить пипы через конвейер
                  </button>
                  <button className={styles.btn} disabled={busy || view.phase !== 'market'}
                    onClick={() => act('closemarket')}>
                    Закрыть рынок
                  </button>
                  <button className={styles.btnDanger} disabled={busy}
                    onClick={() => { if (confirm('Сбросить весь DM?')) act('reset') }}>
                    Сбросить
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={CONVEYOR_RULES} />

        <div className={styles.card}>
          <div className={styles.cardTitle}>Ход игры</div>
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
