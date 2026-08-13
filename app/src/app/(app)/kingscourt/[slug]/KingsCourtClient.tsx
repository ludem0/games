'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { KcView, KcRole } from '@/lib/kingsCourt'
import RulesCard from '@/components/RulesCard'
import { KINGS_COURT_RULES } from './rules'
import styles from './kingscourt.module.css'

const POLL_MS = 5000

interface Props {
  slug: string
  initialView: KcView
  username: string
  role: Role
}

const ROLE_LABEL: Record<KcRole, string> = { king: 'Король', duke: 'Герцог', noble: 'Дворянин' }
const ROLE_CLASS: Record<KcRole, string> = { king: styles.roleKing, duke: styles.roleDuke, noble: styles.roleNoble }
const TEAM_LABEL: Record<string, string> = { king: 'король', dukes: 'герцоги', nobles: 'дворяне' }

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

export default function KingsCourtClient({ slug, initialView, username, role }: Props) {
  const [view, setView] = useState<KcView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [kingPicks, setKingPicks] = useState<string[]>([])
  const [checkPair, setCheckPair] = useState<string[]>([])
  const [peekTarget, setPeekTarget] = useState('')
  const [tolDuke, setTolDuke] = useState('')
  const [tolNoble, setTolNoble] = useState('')
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/kingscourt/${slug}`)
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
    const res = await fetch(`/api/kingscourt/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: KcView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as KcView)
    return true
  }

  const inGame = view.roster.includes(username)
  const canVote = view.phase === 'live' && view.voters.includes(username)
  const owesCheck = view.round?.checkBy === username && !view.round.checkDone
  const others = view.roster.filter(p => p !== username)

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
            {view.phase === 'live' && `Игра ${view.attemptNumber} · раунд ${view.round?.number ?? 1}`}
            {view.phase === 'tiebreak' && 'Ничья: решает король'}
            {view.phase === 'payout' && 'Итоги'}
            {view.phase === 'finished' && 'Завершён'}
          </span>
          <span className={styles.roles}>
            В суде: <strong>{view.court.length}</strong> · голосующих: <strong>{view.voters.length}</strong>
          </span>
          {view.phase === 'live' && view.round && !view.round.tally && (
            <span className={styles.deadline}>До конца раунда: <Countdown deadline={view.round.deadline} /></span>
          )}
        </div>

        {view.winner && (
          <div className={styles.winner}>
            Победа: <strong>{TEAM_LABEL[view.winner]}</strong>
            {view.ec && <> · кандидат на выбывание: <strong>{view.ec}</strong></>}
          </div>
        )}

        {/* my role and my private notes */}
        {inGame && view.myRole && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Вы</div>
            <div className={styles.role}>
              <span className={`${styles.roleName} ${ROLE_CLASS[view.myRole]}`}>{ROLE_LABEL[view.myRole]}</span>
              <span className={styles.hint}>Никто другой этого не видит.</span>
            </div>
            {view.notes.length > 0 && (
              <div className={styles.notes}>
                {view.notes.map((n, i) => <div key={i} className={styles.note}>{n}</div>)}
              </div>
            )}
          </div>
        )}

        {/* the king looks at two players before the first election */}
        {view.amKing && view.kingPeeksLeft > 0 && view.court.length === 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Взгляд короля: выберите двоих</div>
            <div className={styles.voteGrid}>
              {others.map(p => (
                <button key={p}
                  className={`${styles.voteBtn} ${kingPicks.includes(p) ? styles.voteBtnChosen : ''}`}
                  onClick={() => setKingPicks(k => (k.includes(p) ? k.filter(x => x !== p) : [...k, p].slice(-2)))}>
                  {p}
                </button>
              ))}
            </div>
            <button className={styles.btnPrimary} disabled={busy || kingPicks.length !== 2}
              onClick={async () => { if (await act('kingpeek', { names: kingPicks })) setKingPicks([]) }}>
              Посмотреть роли
            </button>
          </div>
        )}

        {/* voting */}
        {canVote && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Голосование{view.myVote ? `: вы голосуете за ${view.myVote}` : ''}
            </div>
            <div className={styles.voteGrid}>
              {view.voters.filter(p => p !== username).map(p => (
                <button key={p} className={`${styles.voteBtn} ${view.myVote === p ? styles.voteBtnChosen : ''}`}
                  disabled={busy} onClick={() => act('vote', { target: p })}>
                  {p}
                  <span className={styles.voteCount}>всего {view.totalVotes[p] ?? 0}</span>
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              Голос можно менять до конца раунда. Кто как голосовал, не публикуется. Молчание стоит 1 псигем.
            </p>
          </div>
        )}

        {/* the check owed to the judge */}
        {owesCheck && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Вы вошли в суд: назовите судье двоих</div>
            <div className={styles.voteGrid}>
              {others.map(p => (
                <button key={p}
                  className={`${styles.voteBtn} ${checkPair.includes(p) ? styles.voteBtnChosen : ''}`}
                  onClick={() => setCheckPair(c => (c.includes(p) ? c.filter(x => x !== p) : [...c, p].slice(-2)))}>
                  {p}
                </button>
              ))}
            </div>
            <button className={styles.btnPrimary} disabled={busy || checkPair.length !== 2}
              onClick={async () => { if (await act('check', { pair: checkPair })) setCheckPair([]) }}>
              Отправить судье
            </button>
            <p className={styles.hint}>Ответ придёт к следующему дедлайну голосования.</p>
          </div>
        )}

        {/* the king breaks a tie */}
        {view.amKing && view.phase === 'tiebreak' && view.round && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ничья: кого ввести в суд</div>
            <div className={styles.voteGrid}>
              {view.round.tiedAmong.filter(p => p !== username).map(p => (
                <button key={p} className={styles.voteBtn} disabled={busy}
                  onClick={() => act('tiebreak', { target: p })}>{p}</button>
              ))}
            </div>
            <p className={styles.hint}>Себя выбрать нельзя. Решение остаётся тайным.</p>
          </div>
        )}

        {/* the court */}
        {view.court.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Суд</div>
            <div className={styles.court}>
              {view.court.map((p, i) => (
                <span key={p} className={styles.courtSeat}>
                  <span className={styles.courtIndex}>{i + 1}</span>{p}
                  {view.seats?.[p] && ` · ${ROLE_LABEL[view.seats[p].role]}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* the last tally */}
        {view.round?.tally && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Голоса прошлого раунда</div>
            <div className={styles.row}>
              {Object.entries(view.round.tally).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
                <span key={p} className={styles.courtSeat}>{p}: {n}</span>
              ))}
            </div>
          </div>
        )}

        {/* purchases */}
        {inGame && (view.phase === 'live' || view.phase === 'tiebreak') && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Покупки</div>
            <div className={styles.row}>
              <select className={styles.input} value={peekTarget} onChange={e => setPeekTarget(e.target.value)}>
                <option value="">Чью роль смотрим</option>
                {others.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btn} disabled={busy || !peekTarget}
                onClick={async () => { if (await act('peek', { target: peekTarget })) setPeekTarget('') }}>
                Посмотреть за 8 Ψ
              </button>
              <button className={styles.btn} disabled={busy} onClick={() => act('annoyed')}>
                Узнать, недолюбливает ли судья меня, за 3 Ψ
              </button>
            </div>
            <p className={styles.hint}>Результат попадёт в ваши записи выше. Короля покупка покажет герцогом или дворянином.</p>
          </div>
        )}

        {/* the king hands out tokens */}
        {view.amKing && view.winner === 'king' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Раздайте два жетона неуязвимости</div>
            <div className={styles.row}>
              <select className={styles.input} value={tolDuke} onChange={e => setTolDuke(e.target.value)}>
                <option value="">Герцог</option>
                {Object.entries(view.seats ?? {}).filter(([, s]) => s.role === 'duke')
                  .map(([p]) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.input} value={tolNoble} onChange={e => setTolNoble(e.target.value)}>
                <option value="">Дворянин</option>
                {Object.entries(view.seats ?? {}).filter(([, s]) => s.role === 'noble')
                  .map(([p]) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className={styles.btnPrimary} disabled={busy || !tolDuke || !tolNoble}
                onClick={() => act('givetol', { duke: tolDuke, noble: tolNoble })}>
                Отдать
              </button>
            </div>
          </div>
        )}

        {/* results */}
        {view.phase === 'payout' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итоги игры</div>
            {view.payout && (
              <p className={styles.hint}>
                Начислено: {Object.entries(view.payout.psigems).map(([p, v]) => `${p} +${v} Ψ`).join(', ') || 'ничего'}
                {' · жетоны: '}
                {Object.entries(view.payout.tol).map(([p, v]) => `${p} +${v}`).join(', ') || 'нет'}
              </p>
            )}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Кандидат на выбывание</th><th>Голоса с бонусом</th></tr>
                </thead>
                <tbody>
                  {view.ecCandidates.map(c => (
                    <tr key={c.player}>
                      <td>{c.player}</td>
                      <td>{c.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin && !view.ec && (
              <div className={styles.row}>
                {view.ecCandidates.slice(0, 4).map(c => (
                  <button key={c.player} className={styles.btn} disabled={busy}
                    onClick={() => act('setec', { target: c.player })}>
                    EC: {c.player} ({c.score})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* admin */}
        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            <div className={styles.row}>
              {view.phase === 'setup' && (
                <button className={styles.btnPrimary} disabled={busy} onClick={() => act('start')}>
                  Раздать роли и начать
                </button>
              )}
              {view.phase === 'live' && (
                <button className={styles.btn} disabled={busy} onClick={() => act('close')}>
                  Закрыть раунд сейчас
                </button>
              )}
              {view.attemptsLeft > 0 && view.phase === 'live' && view.court.length === 0 && view.attemptNumber > 1 && (
                <span className={styles.hint}>Осталось попыток: {view.attemptsLeft}</span>
              )}
              <button className={styles.btn} disabled={busy} onClick={() => act('nextattempt')}>
                Начать переигровку
              </button>
              <button className={styles.btnDanger} disabled={busy}
                onClick={() => { if (confirm('Сбросить весь матч?')) act('reset') }}>
                Сбросить матч
              </button>
            </div>
            {view.seats && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Игрок</th><th>Роль</th><th>Недолюблен</th><th>Голоса</th><th>Имена от судьи</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(view.seats).map(([p, seat]) => (
                      <tr key={p}>
                        <td>{p}</td>
                        <td className={ROLE_CLASS[seat.role]}>{ROLE_LABEL[seat.role]}</td>
                        <td>{seat.annoyed ? 'да' : ''}</td>
                        <td>{view.totalVotes[p] ?? 0}</td>
                        <td>{seat.hints.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {view.formerKings.length > 0 && (
              <p className={styles.hint}>Бывшие короли: {view.formerKings.join(', ')}</p>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={KINGS_COURT_RULES} />

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
