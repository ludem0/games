'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { CubeView, Rps, Face } from '@/lib/theCube'
import RulesCard from '@/components/RulesCard'
import { CUBE_RULES } from './rules'
import styles from './cube.module.css'

const POLL_MS = 5000
const RPS_LABEL: Record<Rps, string> = { rock: 'Камень', paper: 'Бумага', scissors: 'Ножницы' }
const FACE_HEX: Record<Face, string> = {
  red: '#ef4444', yellow: '#facc15', blue: '#3b82f6',
  green: '#22c55e', orange: '#f97316', pink: '#f9a8d4',
}

interface Props {
  slug: string
  initialView: CubeView
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
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span className={left < 3600000 ? styles.clockLow : styles.clock}>
      {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

export default function CubeClient({ slug, initialView, username, role, roster }: Props) {
  const [view, setView] = useState<CubeView>(initialView)
  const [error, setError] = useState('')
  const [scan, setScan] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<number | null>(null)
  const [card, setCard] = useState<Rps | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [tradeWith, setTradeWith] = useState('')
  const [give, setGive] = useState('')
  const [take, setTake] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/thecube/${slug}`)
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
    const res = await fetch(`/api/thecube/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: (CubeView & { scan?: string }) | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    const next = data as CubeView & { scan?: string }
    if (next.scan) setScan(next.scan)
    setView(next)
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
            {view.phase === 'live' && `Раунд ${view.roundNumber} из 18`}
            {view.phase === 'finished' && 'Матч окончен'}
          </span>
          <span className={styles.roles}>
            Полный набор собрали: {view.alarms} · сдали ход: {view.submitted.length} из {view.players.length}
          </span>
          {view.deadline && (
            <span className={styles.deadline}>До дедлайна: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>🏆 Победа: <strong>{view.winner}</strong></div>
        )}

        {view.myVertex && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Вы стоите на вершине</div>
            <div className={styles.row}>
              <span className={styles.faces}>
                {view.myVertex.faces.map(face => (
                  <span key={face} className={styles.face} style={{ background: FACE_HEX[face] }} />
                ))}
              </span>
              <span>{view.myVertex.name}</span>
              {view.myHome && view.myHome.id === view.myVertex.id && <strong>· это ваш дом</strong>}
            </div>
            <p className={styles.hint}>
              Дом: {view.myHome?.name}. Рядом стоят: {view.neighbours.join(', ') || 'никого'}.
            </p>
            <div className={styles.cards}>
              {view.myCards.map((value, i) => <span key={i} className={styles.numCard}>{value}</span>)}
            </div>
            <div className={styles.row}>
              {view.myRps.map((item, i) => (
                <span key={`${item}-${i}`} className={styles.numCard}>{RPS_LABEL[item]}</span>
              ))}
            </div>
          </div>
        )}

        {view.amPlaying && view.phase === 'live' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Куда идём</div>
            <div className={styles.exits}>
              {view.exits.map(exit => (
                <button key={exit.vertex}
                  className={`${styles.exit} ${(target ?? view.myMove?.to) === exit.vertex ? styles.exitChosen : ''}`}
                  onClick={() => setTarget(exit.vertex)}>
                  <div className={styles.exitName}>{exit.name}</div>
                  <div className={styles.exitWho}>
                    {exit.players.length > 0 ? `там: ${exit.players.join(', ')}` : 'пусто'}
                  </div>
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <span>Карта в бой:</span>
              {view.myRps.map((item, i) => (
                <button key={`${item}-${i}`}
                  className={`${styles.cardBtn} ${card === item ? styles.cardChosen : ''}`}
                  onClick={() => setCard(item)}>
                  {RPS_LABEL[item]}
                </button>
              ))}
              <button className={`${styles.cardBtn} ${card === null ? styles.cardChosen : ''}`}
                onClick={() => setCard(null)}>
                Без карты
              </button>
            </div>
            <div className={styles.row}>
              <button className={styles.btnPrimary}
                disabled={busy || (target ?? view.myMove?.to) == null}
                onClick={() => act('move', { to: target ?? view.myMove?.to, rps: card })}>
                Сдать ход
              </button>
              <button className={styles.btn} disabled={busy} onClick={() => act('randomrps')}>
                Случайная карта за 5 Ψ
              </button>
              <button className={styles.btn} disabled={busy} onClick={() => act('scan')}>
                Узнать, кто где, за 1 Ψ
              </button>
            </div>
            {view.myMove && (
              <p className={styles.hint}>
                Заявлено: ребро на вершину {view.myMove.to}, карта{' '}
                {view.myMove.rps ? RPS_LABEL[view.myMove.rps] : 'не играется'}
              </p>
            )}
            {scan && <p className={styles.hint}>{scan}</p>}

            <div className={styles.row}>
              <select className={styles.input} value={tradeWith} onChange={e => setTradeWith(e.target.value)}>
                <option value="">Обмен с тем, кто на моей вершине</option>
                {view.players.filter(p => p !== username).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input className={styles.input} style={{ width: 90 }} placeholder="отдаю"
                value={give} onChange={e => setGive(e.target.value)} />
              <input className={styles.input} style={{ width: 90 }} placeholder="беру"
                value={take} onChange={e => setTake(e.target.value)} />
              <button className={styles.btn} disabled={busy || !tradeWith || !give || !take}
                onClick={() => act('trade', { partner: tradeWith, give: Number(give), take: Number(take) })}>
                Предложить обмен
              </button>
            </div>
          </div>
        )}

        {view.report.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Прошлый раунд</div>
            {view.report.map((line, i) => <p key={i} className={styles.hint}>{line}</p>)}
          </div>
        )}

        {view.phase === 'finished' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итог</div>
            <div className={styles.counts}>
              {view.standings.map(row => (
                <span key={row.player}>{row.player}: уникальных {row.unique}, всего {row.cards}</span>
              ))}
            </div>
            {view.payout && (
              <p className={styles.hint}>
                Начислено: {Object.entries(view.payout.psigems).map(([p, v]) => `${p} +${v} Ψ`).join(', ') || 'ничего'}
                {' · жетоны: '}{Object.keys(view.payout.tol).join(', ') || 'нет'}
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
                        p.includes(player) ? p.filter(x => x !== player) : [...p, player].slice(0, 8))}>
                      {player}
                    </button>
                  ))}
                </div>
                <button className={styles.btnPrimary} disabled={busy || picked.length < 2}
                  onClick={() => act('start', { players: picked })}>
                  Поставить {picked.length} человек на куб
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

        <RulesCard sections={CUBE_RULES} />

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
