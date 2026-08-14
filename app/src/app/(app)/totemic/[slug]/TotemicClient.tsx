'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { TmView, Wager } from '@/lib/totemic'
import RulesCard from '@/components/RulesCard'
import { TOTEMIC_RULES } from './rules'
import styles from './totem.module.css'

const POLL_MS = 5000
const WAGERS: { id: Wager; label: string }[] = [
  { id: 'snake', label: 'Змея' },
  { id: 'wolf', label: 'Волк' },
  { id: 'bear', label: 'Медведь' },
  { id: 'fox', label: 'Лис' },
]

interface Props {
  slug: string
  initialView: TmView
  username: string
  role: Role
  roster: string[]
}

function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, new Date(deadline).getTime() - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  return <span className={styles.clock}>{h}ч {String(m).padStart(2, '0')}м</span>
}

export default function TotemicClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<TmView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [left, setLeft] = useState<number[]>([])
  const [right, setRight] = useState<number[]>([])
  const [wager, setWager] = useState<Wager>('wolf')
  const [letter, setLetter] = useState('A')
  const [fine, setFine] = useState(false)
  const [bidA, setBidA] = useState('1')
  const [bidB, setBidB] = useState('1')
  const [picked, setPicked] = useState<string[]>([])
  const [seriesJson, setSeriesJson] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/totemic/${slug}`)
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
    const res = await fetch(`/api/totemic/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: (TmView & { problem?: string }) | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    const next = data as TmView & { problem?: string }
    if (next.problem) setError(next.problem)
    setView(next)
    return true
  }

  const mine = view.mySpirit ? [view.mySpirit.id, ...view.myExtras, ...view.myTrial] : []

  function toggle(id: number) {
    setSelected(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))
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
            {view.phase === 'auction' && `Раунд ${view.roundNumber}`}
            {view.phase === 'final' && 'Равновесие душ'}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          <span className={styles.roles}>
            Фишки: {view.myChips} · взвешиваний осталось {view.weighingsLeft}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>До дедлайна: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.mySpirit && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваш духовный тотем</div>
            <p>{view.mySpirit.name} · вес <strong>{view.mySpirit.weight}</strong></p>
            {view.myExtras.length > 0 && (
              <p className={styles.hint}>
                Дополнительные духовные: {view.myExtras.map(id => view.grid[id]
                  ? `${view.grid[id].season}/${view.grid[id].sigil}` : id).join(', ')}
              </p>
            )}
            {view.myBalloons.length > 0 && (
              <p className={styles.hint}>
                Шары: {view.myBalloons.map(b => `${b.wager}${b.lift != null ? ` (${b.lift})` : ' (?)'}`).join(', ')}
              </p>
            )}
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.cardTitle}>Тотемы</div>
          <div className={styles.grid}>
            {view.grid.map(totem => (
              <button key={totem.id}
                className={`${styles.totem} ${selected.includes(totem.id) ? styles.totemChosen : ''} ${mine.includes(totem.id) ? styles.totemMine : ''}`}
                onClick={() => toggle(totem.id)}>
                <div>{totem.season}</div>
                <div className={styles.seasonLabel}>{totem.sigil}</div>
                <div className={styles.totemWeight}>{totem.weight ?? '?'}</div>
              </button>
            ))}
          </div>
          <p className={styles.hint}>Выбрано: {selected.length}. Зелёная рамка это ваши тотемы.</p>
        </div>

        {view.amPlaying && view.phase === 'auction' && (
          <>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Аукцион</div>
              {view.series && (
                <p className={styles.hint}>
                  {view.series.a.name}: {view.series.a.totems.map(id =>
                    `${view.grid[id]?.season}/${view.grid[id]?.sigil}`).join(', ')} · {view.series.b.name}:{' '}
                  {view.series.b.totems.map(id => `${view.grid[id]?.season}/${view.grid[id]?.sigil}`).join(', ')}
                </p>
              )}
              <div className={styles.row}>
                <span>Серия A:</span>
                <input className={styles.input} style={{ width: 80 }} type="number" min={1} max={10}
                  value={bidA} onChange={e => setBidA(e.target.value)} />
                <button className={styles.btn} disabled={busy}
                  onClick={() => act('bid', { bid: { series: 'a', amount: Number(bidA), order: selected } })}>
                  Ставка с порядком из выбранных
                </button>
              </div>
              <div className={styles.row}>
                <span>Серия B:</span>
                <input className={styles.input} style={{ width: 80 }} type="number" min={1} max={10}
                  value={bidB} onChange={e => setBidB(e.target.value)} />
                <button className={styles.btn} disabled={busy}
                  onClick={() => act('bid', { bid: { series: 'b', amount: Number(bidB), order: selected } })}>
                  Ставка с порядком из выбранных
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Ставка удачи</div>
              <div className={styles.row}>
                {WAGERS.map(item => (
                  <button key={item.id} className={`${styles.btn} ${wager === item.id ? styles.toggle : ''}`}
                    onClick={() => setWager(item.id)}>{item.label}</button>
                ))}
                {wager === 'snake' && (
                  <select className={styles.input} value={letter} onChange={e => setLetter(e.target.value)}>
                    {'ABCDEFGHIJ'.split('').map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                )}
                {(wager === 'bear' || wager === 'fox') && (
                  <button className={`${styles.btn} ${fine ? styles.toggle : ''}`} onClick={() => setFine(f => !f)}>
                    {wager === 'bear' ? 'Сузить диапазон за 1 Ψ' : 'Заплатить 4 Ψ вместо шара'}
                  </button>
                )}
                <button className={styles.btnPrimary} disabled={busy}
                  onClick={() => act('wager', { wager: { kind: wager, totems: selected, letter, fine } })}>
                  Взять ставку
                </button>
              </div>
            </div>
          </>
        )}

        {view.amPlaying && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Весы</div>
            <div className={styles.row}>
              <button className={`${styles.btn} ${side === 'left' ? styles.toggle : ''}`}
                onClick={() => setSide('left')}>Класть слева</button>
              <button className={`${styles.btn} ${side === 'right' ? styles.toggle : ''}`}
                onClick={() => setSide('right')}>Класть справа</button>
              <button className={styles.btn} disabled={selected.length === 0}
                onClick={() => {
                  if (side === 'left') setLeft(l => [...new Set([...l, ...selected])])
                  else setRight(r => [...new Set([...r, ...selected])])
                  setSelected([])
                }}>
                Добавить выбранные
              </button>
              <button className={styles.btn} onClick={() => { setLeft([]); setRight([]) }}>Очистить</button>
            </div>
            <p className={styles.hint}>
              Слева: {left.length} · справа: {right.length}
            </p>
            <button className={styles.btnPrimary} disabled={busy || view.weighingsLeft <= 0}
              onClick={() => act('weigh', { left, right }).then(() => { setLeft([]); setRight([]) })}>
              Взвесить
            </button>
            {view.myWeighings.length > 0 && (
              <div className={styles.notes}>
                {view.myWeighings.map((item, i) => (
                  <div key={i} className={styles.note}>
                    {item.left.length} против {item.right.length}: {item.result}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.poolChoice.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Выберите духовный тотем из запаса</div>
            <div className={styles.row}>
              {view.poolChoice.map(id => (
                <button key={id} className={styles.btn} disabled={busy}
                  onClick={() => act('claimspirit', { totem: id })}>
                  {view.grid[id]?.season}/{view.grid[id]?.sigil}
                </button>
              ))}
            </div>
          </div>
        )}

        {view.myNotes.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваши записи</div>
            <div className={styles.notes}>
              {view.myNotes.map((text, i) => <div key={i} className={styles.note}>{text}</div>)}
            </div>
          </div>
        )}

        {view.phase === 'final' && view.amPlaying && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Равновесие душ</div>
            <p className={styles.hint}>
              Разложите все 20 тотемов, свои духовные и все шары на три стороны. Провалов пока: {view.failures}.
              {view.finalScore != null && ` Ваш счёт: ${view.finalScore}.`}
            </p>
            <p className={styles.hint}>
              Раскладка отправляется тремя списками. Соберите первую сторону выбором тотемов и нажмите кнопку.
            </p>
            <button className={styles.btnPrimary} disabled={busy}
              onClick={() => act('balance', {
                sides: [
                  { totems: selected, balloons: view.myBalloons.map(b => b.id) },
                  { totems: [], balloons: [] },
                  { totems: [], balloons: [] },
                ],
              })}>
              Проверить раскладку
            </button>
          </div>
        )}

        {view.ranking && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итоговый порядок</div>
            <p className={styles.hint}>{view.ranking.join(' → ')}</p>
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
                <p className={styles.hint}>
                  Состав серий задаётся JSON: {'{"a":{"name":"1A","totems":[0,1,2,3,4]},"b":{"name":"1B","totems":[5,6,7,8,9]}}'}
                </p>
                <textarea className={styles.input} rows={3} value={seriesJson}
                  onChange={e => setSeriesJson(e.target.value)} />
                <button className={styles.btnPrimary} disabled={busy || picked.length < 3}
                  onClick={() => {
                    try {
                      act('start', { players: picked, series: JSON.parse(seriesJson) })
                    } catch {
                      setError('JSON серий не разобрался')
                    }
                  }}>
                  Начать матч
                </button>
              </>
            ) : (
              <div className={styles.row}>
                <button className={styles.btn} disabled={busy || view.phase !== 'auction'}
                  onClick={() => {
                    try {
                      act('close', { series: seriesJson ? JSON.parse(seriesJson) : null })
                    } catch {
                      setError('JSON серий не разобрался')
                    }
                  }}>
                  Закрыть раунд
                </button>
                <button className={styles.btn} disabled={busy || view.phase !== 'final'}
                  onClick={() => act('finish')}>
                  Подвести итоги
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

        <RulesCard sections={TOTEMIC_RULES} />

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
      </main>
    </div>
  )
}
