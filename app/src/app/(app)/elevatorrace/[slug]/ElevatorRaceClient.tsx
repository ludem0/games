'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Role } from '@/lib/types'
import type { ErView, RollerKind, RollValue } from '@/lib/elevatorRace'
import RulesCard from '@/components/RulesCard'
import { powersIn, powerById, COLUMNS as POWER_COLUMNS } from '@/lib/racePowers'
import { ELEVATOR_RACE_RULES } from './rules'
import styles from './elevatorrace.module.css'
import Countdown from '@/components/Countdown'

const POLL_MS = 5000
const PURPLE = [17, 33, 49]
const ROLLER_LABEL: Record<RollerKind, string> = {
  coin: 'Монета 0/1', spinner: 'Спиннер 1/3/5', dice: 'Кубик 1-4', lotto: 'Лото bust/2-6',
}

interface Props {
  slug: string
  initialView: ErView
  username: string
  role: Role
}


/** Rows run in a snake, so every other one is drawn right to left. */
function boardRows(): number[][] {
  const rows: number[][] = []
  for (let row = 8; row >= 1; row--) {
    const start = (row - 1) * 8 + 1
    const line = Array.from({ length: 8 }, (_, i) => start + i)
    rows.push(row % 2 === 1 ? line : [...line].reverse())
  }
  return rows
}

export default function ElevatorRaceClient({ slug, initialView, username, role }: Props) {
  const [view, setView] = useState<ErView>(initialView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [claim, setClaim] = useState('')
  const [bidPower, setBidPower] = useState('')
  const [bidAmount, setBidAmount] = useState('0')
  const [elevatorText, setElevatorText] = useState(
    initialView.elevators.map(e => `${e.from}-${e.to}`).join(', '))
  const logEnd = useRef<HTMLDivElement>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    const res = await fetch(`/api/elevatorrace/${slug}`)
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
    const res = await fetch(`/api/elevatorrace/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    setBusy(false)
    let data: ErView | { error?: string }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(('error' in data && data.error) || `Ошибка ${res.status}`); return false }
    setView(data as ErView)
    return true
  }

  const me = view.standings.find(s => s.player === username)
  const racing = !!me && me.finishPlace == null
  const elevatorFor = (space: number) => view.elevators.find(e => e.from === space) ?? null

  function saveElevators() {
    const list = elevatorText.split(',').map(part => {
      const [from, to] = part.trim().split('-').map(Number)
      return { from, to }
    })
    act('elevators', { elevators: list })
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
            {view.phase === 'roll' && `Ход ${view.turnNumber}: бросок`}
            {view.phase === 'bluff' && `Ход ${view.turnNumber}: блеф`}
            {view.phase === 'finished' && 'Гонка закончена'}
          </span>
          <span className={styles.roles}>
            Нижний живой ряд: <strong>{view.floor}</strong>
            {view.flipped && ' · лифты развёрнуты'}
          </span>
          {view.deadline && view.phase !== 'finished' && (
            <span className={styles.deadline}>До конца фазы: <Countdown deadline={view.deadline} /></span>
          )}
        </div>

        {view.phase === 'finished' && view.payout && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Итоги</div>
            <p className={styles.hint}>Порядок финиша: {view.finishOrder.join(' → ')}</p>
            <p className={styles.hint}>
              В дэтматч: <strong>{view.payout.deathmatch.join(', ')}</strong>
            </p>
            <p className={styles.hint}>
              Начислено: {Object.entries(view.payout.psigems).map(([p, v]) => `${p} +${v} Ψ`).join(', ') || 'ничего'}
              {' · прозрачные опалы: '}
              {Object.keys(view.payout.clearOpals).join(', ') || 'нет'}
            </p>
          </div>
        )}

        {/* the draft */}
        {view.phase === 'draft' && view.draft && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {view.draft.cycle <= POWER_COLUMNS.length
                ? `Торги за силы: цикл ${view.draft.cycle} из ${POWER_COLUMNS.length}`
                : 'Силы разобраны: настройте роллеры'}
            </div>

            {view.draft.cycle <= POWER_COLUMNS.length && view.inRace && (
              <>
                <p className={styles.hint}>
                  Ставки закрытые. Единственный претендент получает силу бесплатно, иначе платит тот,
                  кто поставил больше, а проигравшие спускаются по колонке до ближайшей свободной силы.
                </p>
                <div className={styles.row}>
                  <select className={styles.input} value={bidPower} onChange={e => setBidPower(e.target.value)}>
                    <option value="">Сила</option>
                    {powersIn(POWER_COLUMNS[view.draft.cycle - 1]).map(power => (
                      <option key={power.id} value={power.id}>{power.name}</option>
                    ))}
                  </select>
                  <input className={styles.input} type="number" min={0} style={{ width: 90 }}
                    value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                  <button className={styles.btnPrimary} disabled={busy || !bidPower}
                    onClick={() => act('bid', { power: bidPower, amount: Number(bidAmount) })}>
                    Поставить
                  </button>
                </div>
                {view.draft.bid && (
                  <p className={styles.hint}>
                    Ваша ставка: {powerById(view.draft.bid.power)?.name} за {view.draft.bid.amount} Ψ
                  </p>
                )}
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Сила</th><th>Что делает</th><th>Считает</th></tr></thead>
                    <tbody>
                      {powersIn(POWER_COLUMNS[view.draft.cycle - 1]).map(power => (
                        <tr key={power.id}>
                          <td>{power.name}</td>
                          <td>{power.text}</td>
                          <td>{power.automatic ? 'движок' : 'ведущий'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {view.myPowers.length > 0 && (
              <p className={styles.hint}>
                Ваши силы: {view.myPowers.map(id => powerById(id)?.name ?? id).join(', ')}
              </p>
            )}
            {view.draft.notes.length > 0 && (
              <p className={styles.hint}>{view.draft.notes.join(' · ')}</p>
            )}
          </div>
        )}

        {/* roller settings that come with the Edit powers */}
        {view.phase === 'draft' && view.inRace && view.myPowers.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Настройки роллеров</div>
            {view.myPowers.includes('coin_edit') && (
              <div className={styles.row}>
                <span>Монета вместо 1:</span>
                {[2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button key={n} className={styles.btn} disabled={busy}
                    onClick={() => act('config', { config: { coinFace: n } })}>{n}</button>
                ))}
                <span className={styles.hint}>сейчас {view.myConfig.coinFace ?? 1}</span>
              </div>
            )}
            {view.myPowers.includes('dice_edit') && (
              <div className={styles.row}>
                <span>Пятая грань кубика:</span>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button key={n} className={styles.btn} disabled={busy}
                    onClick={() => act('config', { config: { diceFifth: n } })}>{n}</button>
                ))}
                <span className={styles.hint}>сейчас {view.myConfig.diceFifth ?? 'нет'}</span>
              </div>
            )}
            {(view.myPowers.includes('less') || view.myPowers.includes('more')) && (
              <div className={styles.row}>
                <span>{view.myPowers.includes('less') ? 'Убрать роллер:' : 'Лишняя копия:'}</span>
                {(['coin', 'spinner', 'dice', 'lotto'] as RollerKind[]).map(r => (
                  <button key={r} className={styles.btn} disabled={busy}
                    onClick={() => act('config', view.myPowers.includes('less')
                      ? { config: { removedRoller: r } }
                      : { config: { extraRoller: r } })}>
                    {ROLLER_LABEL[r].split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <p className={styles.hint}>
              Спиннер, лото, отрицательные числа, Dash и Single ведущий заводит вместе с вами.
            </p>
          </div>
        )}

        {/* the board */}
        {view.phase !== 'setup' && view.phase !== 'draft' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Доска</div>
            <div className={styles.board}>
              {boardRows().map((line, i) => (
                <div key={i} className={styles.boardRow}>
                  {line.map(space => {
                    const elevator = elevatorFor(space)
                    const cut = Math.ceil(space / 8) < view.floor
                    const cls = [
                      styles.square,
                      cut ? styles.squareCut : '',
                      PURPLE.includes(space) ? styles.squarePurple : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <div key={space} className={cls}>
                        <span>
                          {space}
                          {elevator && (
                            <span className={elevator.to > elevator.from ? styles.up : styles.down}>
                              {elevator.to > elevator.from ? ' ↑' : ' ↓'}{elevator.to}
                            </span>
                          )}
                        </span>
                        <span className={styles.pawns}>
                          {view.standings.filter(s => s.space === space && s.finishPlace == null).map(s => (
                            <span key={s.player}
                              className={`${styles.pawn} ${s.player === username ? styles.pawnMe : ''}`}>
                              {s.player.slice(0, 3)}
                            </span>
                          ))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className={styles.hint}>
              Стартовая клетка 0 и финиш 65 вне доски. Слева фиолетовые границы на 17, 33 и 49.
            </p>
          </div>
        )}

        {/* my turn */}
        {racing && view.phase === 'roll' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ваш бросок</div>
            {view.myRoll ? (
              <div className={styles.roll}>
                {ROLLER_LABEL[view.myRoll.roller]}: <span className={styles.rollValue}>{String(view.myRoll.value)}</span>
              </div>
            ) : (
              <div className={styles.row}>
                {view.myHand.map(roller => (
                  <button key={roller} className={styles.btn} disabled={busy}
                    onClick={() => act('roll', { roller })}>
                    {ROLLER_LABEL[roller]}
                  </button>
                ))}
              </div>
            )}

            {view.myRoll && (
              <div className={styles.row}>
                <span>Заявка:</span>
                <select className={styles.input} value={claim} onChange={e => setClaim(e.target.value)}>
                  <option value="">Выберите</option>
                  {['0', '1', '2', '3', '4', '5', '6', '7', '8', 'bust'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button className={styles.btnPrimary} disabled={busy || !claim}
                  onClick={() => act('claim', { claim: claim === 'bust' ? 'bust' : Number(claim) })}>
                  {view.myClaim != null ? 'Изменить заявку' : 'Заявить'}
                </button>
                {view.myClaim != null && <span className={styles.hint}>Сейчас заявлено: {String(view.myClaim)}</span>}
              </div>
            )}
            <p className={styles.hint}>
              Солгать нужно ровно один раз за сброс. В этом сбросе лжи пока: <strong>{view.myLies}</strong>.
              Роллеров в руке: {view.myHand.length}.
            </p>
          </div>
        )}

        {racing && view.phase === 'bluff' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Вызовы</div>
            <div className={styles.row}>
              {view.standings.filter(s => s.finishPlace == null && s.player !== username).map(s => (
                <button key={s.player} className={styles.btn}
                  disabled={busy || !!view.myChallenge}
                  onClick={() => act('challenge', { target: s.player })}>
                  {s.player} заявил {String(s.claim)}
                </button>
              ))}
            </div>
            {view.myChallenge && <p className={styles.hint}>Вы вызвали: <strong>{view.myChallenge}</strong></p>}
            <button className={styles.btn} disabled={busy} onClick={() => act('buylife')}>
              Купить жизнь за 5 Ψ
            </button>
          </div>
        )}

        {/* standings */}
        {view.phase !== 'setup' && view.phase !== 'draft' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Положение</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Игрок</th><th>Клетка</th><th>Жизни</th><th>Роллеров</th>
                    <th>Заявка</th><th>Вызвали</th><th>Силы</th><th>Финиш</th>
                  </tr>
                </thead>
                <tbody>
                  {view.standings.map(s => (
                    <tr key={s.player}>
                      <td className={s.player === username ? styles.me : ''}>{s.player}</td>
                      <td>{s.space}</td>
                      <td>{s.lives}</td>
                      <td>{s.handSize}</td>
                      <td>{s.claim == null ? '' : String(s.claim)}</td>
                      <td>{s.challengedBy.join(', ')}</td>
                      <td>{(view.powersOf[s.player] ?? []).map(id => powerById(id)?.name ?? id).join(', ')}</td>
                      <td>{s.finishPlace ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.lastMoves && (
              <p className={styles.hint}>
                Прошлый ход: {Object.entries(view.lastMoves)
                  .map(([p, m]) => `${p} ${m.from}→${m.to} (${m.reason})`).join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* admin */}
        {isAdmin && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Ведущий</div>
            {view.phase === 'setup' && (
              <>
                <p className={styles.hint}>
                  Проверьте лифты перед стартом: список читается как «откуда-куда» через запятую.
                  Значения по умолчанию сняты с эталонной картинки и могут расходиться.
                </p>
                <textarea className={styles.input} rows={3} value={elevatorText}
                  onChange={e => setElevatorText(e.target.value)} />
                <div className={styles.row}>
                  <button className={styles.btn} disabled={busy} onClick={saveElevators}>Сохранить лифты</button>
                  <button className={styles.btnPrimary} disabled={busy} onClick={() => act('start')}>
                    Начать гонку
                  </button>
                </div>
              </>
            )}
            {view.phase !== 'setup' && view.phase !== 'finished' && (
              <div className={styles.row}>
                <button className={styles.btn} disabled={busy} onClick={() => act('close')}>
                  Закрыть фазу сейчас
                </button>
                {view.phase === 'draft' && (
                  <button className={styles.btnPrimary} disabled={busy} onClick={() => act('gorace')}>
                    Закончить торги и стартовать
                  </button>
                )}
              </div>
            )}
            <button className={styles.btnDanger} disabled={busy}
              onClick={() => { if (confirm('Сбросить всю гонку?')) act('reset') }}>
              Сбросить гонку
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <RulesCard sections={ELEVATOR_RACE_RULES} />

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
