'use client'

import { useState, useMemo } from 'react'
import type { Round, MainMatch, DeathMatch, FinalGame } from '@/lib/seasons'
import styles from './rounds.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  initialRounds: Round[]
  participants: string[]
  psigems: Record<string, number>
}

type MMRole = 'winner' | 'loser' | 'none'

interface MMGameForm {
  name: string
  columnName: string
  points: Record<string, number>
}

interface FormState {
  mode: 'regular' | 'final'
  mmName: string
  mmParticipants: string[]
  mmRoles: Record<string, MMRole>
  mmPsigemDelta: Record<string, number>
  mmGames: MMGameForm[]
  dmName: string
  dmWinner: string
  dmEliminated: string
  dmPoints: Record<string, number>
  dmColumnName: string
  finalGames: FinalGame[]
  finalColumnName: string
  step: 1 | 2
}

const INIT_FORM: FormState = {
  mode: 'regular',
  mmName: '',
  mmParticipants: [],
  mmRoles: {},
  mmPsigemDelta: {},
  mmGames: [{ name: '', columnName: 'Очки', points: {} }],
  dmName: '',
  dmWinner: '',
  dmEliminated: '',
  dmPoints: {},
  dmColumnName: 'Очки',
  finalGames: [],
  finalColumnName: 'Очки',
  step: 1,
}

function recomputePsigems(participants: string[], rounds: Round[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(participants.map(p => [p, 1]))
  for (const round of rounds) {
    for (const [name, delta] of Object.entries(round.mmPsigemDelta ?? {})) {
      result[name] = Math.max(0, (result[name] ?? 1) + delta)
    }
    if (round.deathMatch) {
      const { winner, eliminated } = round.deathMatch
      const eliminatedPsi = result[eliminated] ?? 0
      result[winner] = (result[winner] ?? 1) + eliminatedPsi
      result[eliminated] = 0
    }
  }
  return result
}

export default function RoundsSection({ slug, accent, isAdmin, initialRounds, participants, psigems: initialPsigems }: Props) {
  const [rounds, setRounds] = useState<Round[]>(initialRounds)
  const [psigems, setPsigems] = useState(initialPsigems)
  const [showForm, setShowForm] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(initialRounds.map(r => r.id)))
  const [form, setForm] = useState<FormState>(INIT_FORM)
  const [saving, setSaving] = useState(false)

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  const eliminatedPlayers = useMemo(() =>
    rounds.map(r => r.deathMatch?.eliminated).filter(Boolean) as string[],
    [rounds]
  )
  const availableParticipants = participants.filter(p => !eliminatedPlayers.includes(p))
  const isFinalTime = availableParticipants.length === 2
  const finalExists = rounds.some(r => r.type === 'final')

  const losers = form.mmParticipants.filter(p => form.mmRoles[p] === 'loser')
  const winners = form.mmParticipants.filter(p => form.mmRoles[p] === 'winner')

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleMMParticipant(name: string) {
    setForm(f => {
      const has = f.mmParticipants.includes(name)
      return {
        ...f,
        mmParticipants: has ? f.mmParticipants.filter(p => p !== name) : [...f.mmParticipants, name],
        mmRoles: has ? Object.fromEntries(Object.entries(f.mmRoles).filter(([k]) => k !== name)) : f.mmRoles,
      }
    })
  }

  function setRole(name: string, role: MMRole) {
    setForm(f => ({ ...f, mmRoles: { ...f.mmRoles, [name]: role } }))
  }

  function adjustPsi(name: string, delta: number) {
    setForm(f => ({ ...f, mmPsigemDelta: { ...f.mmPsigemDelta, [name]: (f.mmPsigemDelta[name] ?? 0) + delta } }))
  }

  function addMMGame() {
    setForm(f => ({ ...f, mmGames: [...f.mmGames, { name: '', columnName: 'Очки', points: {} }] }))
  }

  function updateMMGame(idx: number, field: 'name' | 'columnName', val: string) {
    setForm(f => {
      const games = [...f.mmGames]
      games[idx] = { ...games[idx], [field]: val }
      return { ...f, mmGames: games }
    })
  }

  function setMMGamePoints(idx: number, player: string, val: string) {
    setForm(f => {
      const games = [...f.mmGames]
      games[idx] = { ...games[idx], points: { ...games[idx].points, [player]: parseInt(val) || 0 } }
      return { ...f, mmGames: games }
    })
  }

  function removeMMGame(idx: number) {
    if (form.mmGames.length <= 1) return
    setForm(f => ({ ...f, mmGames: f.mmGames.filter((_, i) => i !== idx) }))
  }

  function setFinalGameWinner(idx: number, winner: string) {
    setForm(f => {
      const games = [...f.finalGames]
      games[idx] = { ...games[idx], winner }
      return { ...f, finalGames: games }
    })
  }

  function setFinalGamePoints(idx: number, player: string, val: string) {
    setForm(f => {
      const games = [...f.finalGames]
      games[idx] = { ...games[idx], points: { ...(games[idx].points ?? {}), [player]: parseInt(val) || 0 } }
      return { ...f, finalGames: games }
    })
  }

  function addFinalGame(name: string) {
    setForm(f => ({ ...f, finalGames: [...f.finalGames, { name, winner: '', points: {}, columnName: f.finalColumnName }] }))
  }

  function getFinalWinner(games: { winner: string }[], players: string[]): string | null {
    const wins = Object.fromEntries(players.map(p => [p, 0]))
    for (const g of games) { if (g.winner) wins[g.winner] = (wins[g.winner] ?? 0) + 1 }
    return players.find(p => wins[p] >= 2) ?? null
  }

  function canGoStep2() {
    return form.mmParticipants.length > 0 && losers.length > 0 && winners.length > 0
  }

  function canSaveRegular() {
    return form.dmName.trim() !== '' && form.dmWinner !== '' && form.dmEliminated !== '' && form.dmWinner !== form.dmEliminated
  }

  function canSaveFinal() {
    const champion = getFinalWinner(form.finalGames, availableParticipants)
    return !!champion && form.finalGames.length >= 2
  }

  async function handleSaveRegular() {
    if (!canSaveRegular()) return
    setSaving(true)
    const newPsigems = { ...psigems }
    for (const [name, delta] of Object.entries(form.mmPsigemDelta)) {
      newPsigems[name] = Math.max(0, (newPsigems[name] ?? 1) + delta)
    }
    const eliminatedPsi = newPsigems[form.dmEliminated] ?? 1
    newPsigems[form.dmWinner] = (newPsigems[form.dmWinner] ?? 1) + eliminatedPsi
    newPsigems[form.dmEliminated] = 0
    const mm: MainMatch = {
      name: form.mmName,
      participants: form.mmParticipants,
      winners,
      losers,
      games: form.mmGames.map(g => ({ name: g.name, columnName: g.columnName || 'Очки', points: g.points })),
    }
    const dm: DeathMatch = {
      name: form.dmName,
      participants: losers,
      winner: form.dmWinner,
      eliminated: form.dmEliminated,
      points: form.dmPoints,
      columnName: form.dmColumnName || 'Очки',
    }
    const [roundRes, psiRes] = await Promise.all([
      fetch(`/api/seasons/${slug}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainMatch: mm, deathMatch: dm, mmPsigemDelta: form.mmPsigemDelta }),
      }),
      fetch(`/api/seasons/${slug}/psigems`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPsigems),
      }),
    ])
    if (roundRes.ok) { const r = await roundRes.json(); setRounds(prev => [...prev, r]); setCollapsed(prev => new Set([...prev, r.id])) }
    if (psiRes.ok) setPsigems(await psiRes.json())
    setSaving(false); setShowForm(false); setForm(INIT_FORM)
  }

  async function handleSaveFinal() {
    if (!canSaveFinal()) return
    setSaving(true)
    const players = availableParticipants
    const champion = getFinalWinner(form.finalGames, players)!
    const loser = players.find(p => p !== champion)!
    const newPsigems = { ...psigems }
    for (const [name, delta] of Object.entries(form.mmPsigemDelta)) {
      newPsigems[name] = Math.max(0, (newPsigems[name] ?? 1) + delta)
    }
    const mm: MainMatch = { name: 'Финал', participants: players, winners: [champion], losers: [loser] }
    const finalGamesWithMeta = form.finalGames.map(g => ({ ...g, columnName: form.finalColumnName }))
    const res = await fetch(`/api/seasons/${slug}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'final', mainMatch: mm, deathMatch: null, finalGames: finalGamesWithMeta }),
    })
    if (res.ok) { const r = await res.json(); setRounds(prev => [...prev, r]); setCollapsed(prev => new Set([...prev, r.id])) }
    await fetch(`/api/seasons/${slug}/psigems`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPsigems) })
    setSaving(false); setShowForm(false); setForm(INIT_FORM)
  }

  async function handleDelete(round: Round) {
    if (!confirm(`Удалить ${round.type === 'final' ? 'Финал' : `Раунд ${round.number}`}?`)) return
    await fetch(`/api/seasons/${slug}/rounds/${round.id}`, { method: 'DELETE' })
    const remaining = rounds.filter(r => r.id !== round.id).map((r, i) => ({ ...r, number: i + 1 }))
    setRounds(remaining)
    const recomputed = recomputePsigems(participants, remaining)
    setPsigems(recomputed)
    await fetch(`/api/seasons/${slug}/psigems`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recomputed),
    })
  }

  const [newGameName, setNewGameName] = useState('')

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>РАУНДЫ</span>
        {isAdmin && !showForm && !finalExists && (
          <button className={styles.btnOutline}
            onClick={() => { setForm({ ...INIT_FORM, mode: isFinalTime ? 'final' : 'regular' }); setShowForm(true) }}>
            {isFinalTime ? '🏆 Добавить финал' : '+ Добавить раунд'}
          </button>
        )}
      </div>

      {rounds.length === 0 && !showForm && <p className={styles.empty}>Раунды ещё не добавлены</p>}

      <div className={styles.roundsList}>
        {rounds.map((round, idx) => (
          <RoundCard
            key={round.id}
            round={round}
            accent={accent}
            isAdmin={isAdmin}
            initials={initials}
            psigems={psigems}
            isLast={idx === rounds.length - 1}
            isCollapsed={collapsed.has(round.id)}
            onToggle={() => toggleCollapse(round.id)}
            onDelete={() => handleDelete(round)}
          />
        ))}
      </div>

      {/* Final form */}
      {showForm && form.mode === 'final' && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <span className={styles.formTitle}>🏆 Финал — Best of 3</span>
            <span className={styles.finalPlayers}>{availableParticipants.join(' vs ')}</span>
          </div>
          <div className={styles.formBody}>
            <input className={`${styles.input} ${styles.inputNarrow}`} placeholder="Название столбца (напр. Очки)"
              value={form.finalColumnName}
              onChange={e => setForm(f => ({ ...f, finalColumnName: e.target.value }))} />

            <div className={styles.finalGamesSection}>
              {form.finalGames.map((g, i) => (
                <div key={i} className={styles.finalGame}>
                  <div className={styles.finalGameTop}>
                    <span className={styles.finalGameNum}>Игра {i + 1}</span>
                    {g.name && <span className={styles.finalGameName}>"{g.name}"</span>}
                  </div>
                  <div className={styles.finalGamePoints}>
                    {availableParticipants.map(p => (
                      <div key={p} className={styles.finalPointRow}>
                        <span className={styles.finalPointName}>{p}</span>
                        <input className={styles.pointsInput} type="number" min={0} placeholder="0"
                          value={g.points?.[p] ?? ''}
                          onChange={e => setFinalGamePoints(i, p, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className={styles.finalGameBtns}>
                    <span className={styles.finalGameWinnerLabel}>Победитель:</span>
                    {availableParticipants.map(p => (
                      <button key={p}
                        className={`${styles.finalPlayerBtn} ${g.winner === p ? styles.finalPlayerBtnWin : ''}`}
                        onClick={() => setFinalGameWinner(i, g.winner === p ? '' : p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {form.finalGames.length > 0 && (() => {
                const wins = Object.fromEntries(availableParticipants.map(p => [p, 0]))
                form.finalGames.forEach(g => { if (g.winner) wins[g.winner] = (wins[g.winner] ?? 0) + 1 })
                const champion = availableParticipants.find(p => wins[p] >= 2)
                return (
                  <div className={styles.finalScore}>
                    {availableParticipants.map(p => (
                      <span key={p} className={`${styles.finalScoreItem} ${champion === p ? styles.finalChampion : ''}`}>
                        {p}: {wins[p]}
                      </span>
                    ))}
                    {champion && <span className={styles.finalWinnerLabel}>🏆 Победитель: {champion}</span>}
                  </div>
                )
              })()}

              {form.finalGames.length < 3 && !getFinalWinner(form.finalGames, availableParticipants) && (
                <div className={styles.addGameRow}>
                  <input className={styles.input} placeholder="Название игры (необязательно)"
                    value={newGameName} onChange={e => setNewGameName(e.target.value)} />
                  <button className={styles.btnNext} onClick={() => { addFinalGame(newGameName); setNewGameName('') }}>
                    + Игра {form.finalGames.length + 1}
                  </button>
                </div>
              )}
            </div>

            {form.finalGames.length > 0 && (
              <>
                <p className={styles.hint}>Псигемы:</p>
                <div className={styles.roleGrid}>
                  {availableParticipants.map(p => {
                    const cur = (psigems[p] ?? 1) + (form.mmPsigemDelta[p] ?? 0)
                    return (
                      <div key={p} className={`${styles.roleRow} ${styles.roleRowSimple}`}>
                        <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                        <span className={styles.roleName}>{p}</span>
                        <div className={styles.psiInline}>
                          <button className={styles.psiSmBtn} onClick={() => adjustPsi(p, -1)}>−</button>
                          <span className={styles.psiSmVal}>{cur}</span>
                          <button className={styles.psiSmBtn} onClick={() => adjustPsi(p, 1)}>+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div className={styles.formActions}>
              <button className={styles.btnCancel} onClick={() => { setShowForm(false); setForm(INIT_FORM) }}>Отмена</button>
              <button className={styles.btnSave} disabled={!canSaveFinal() || saving} onClick={handleSaveFinal}>
                {saving ? '...' : 'Сохранить финал'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regular round form */}
      {showForm && form.mode === 'regular' && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <span className={styles.formTitle}>Раунд {rounds.length + 1}</span>
            <div className={styles.steps}>
              <span className={`${styles.step} ${form.step === 1 ? styles.stepActive : styles.stepDone}`}>1 Main Match</span>
              <span className={styles.stepArrow}>→</span>
              <span className={`${styles.step} ${form.step === 2 ? styles.stepActive : ''}`}>2 Death Match</span>
            </div>
          </div>

          {form.step === 1 && (
            <div className={styles.formBody}>
              <div className={styles.mmHeader}><div className={styles.mmBar} /><span className={styles.matchLabel}>MAIN MATCH</span></div>

              <input className={styles.input} placeholder="Название матча (необязательно)" value={form.mmName}
                onChange={e => setForm(f => ({ ...f, mmName: e.target.value }))} />

              <p className={styles.hint}>Участники:</p>
              <div className={styles.chipGrid}>
                {availableParticipants.map(p => (
                  <button key={p} className={`${styles.chip} ${form.mmParticipants.includes(p) ? styles.chipSelected : ''}`}
                    onClick={() => toggleMMParticipant(p)}>{p}</button>
                ))}
              </div>

              {form.mmParticipants.length > 0 && (
                <>
                  <p className={styles.hint}>Роли / Псигемы:</p>
                  <div className={styles.roleGrid}>
                    <div className={styles.roleHead} style={{ gridTemplateColumns: '28px 1fr 90px 70px' }}>
                      <span /><span />
                      <span className={styles.roleHeadCell}>Ψ</span>
                      <span className={styles.roleHeadCell}>Роль</span>
                    </div>
                    {form.mmParticipants.map(p => {
                      const curPsi = (psigems[p] ?? 1) + (form.mmPsigemDelta[p] ?? 0)
                      return (
                        <div key={p} className={styles.roleRow} style={{ gridTemplateColumns: '28px 1fr 90px 70px' }}>
                          <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                          <span className={styles.roleName}>{p}</span>
                          <div className={styles.psiInline}>
                            <button className={styles.psiSmBtn} onClick={() => adjustPsi(p, -1)}>−</button>
                            <span className={styles.psiSmVal}>{curPsi}</span>
                            <button className={styles.psiSmBtn} onClick={() => adjustPsi(p, 1)}>+</button>
                          </div>
                          <div className={styles.roleBtns}>
                            <button className={`${styles.roleBtn} ${form.mmRoles[p] === 'winner' ? styles.roleBtnWin : ''}`}
                              onClick={() => setRole(p, form.mmRoles[p] === 'winner' ? 'none' : 'winner')}>🏆</button>
                            <button className={`${styles.roleBtn} ${form.mmRoles[p] === 'loser' ? styles.roleBtnLose : ''}`}
                              onClick={() => setRole(p, form.mmRoles[p] === 'loser' ? 'none' : 'loser')}>⚔️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <p className={styles.hint}>Игры:</p>
                  <div className={styles.mmGamesSection}>
                    {form.mmGames.map((game, gi) => (
                      <div key={gi} className={styles.mmGameBlock}>
                        <div className={styles.mmGameHeader}>
                          <span className={styles.mmGameNum}>Игра {gi + 1}</span>
                          {form.mmGames.length > 1 && (
                            <button className={styles.removeGameBtn} onClick={() => removeMMGame(gi)}>✕</button>
                          )}
                        </div>
                        <div className={styles.mmGameInputs}>
                          <input className={styles.input} placeholder="Название игры (необязательно)"
                            value={game.name} onChange={e => updateMMGame(gi, 'name', e.target.value)} />
                          <input className={`${styles.input} ${styles.inputNarrow}`} placeholder="Название столбца"
                            value={game.columnName} onChange={e => updateMMGame(gi, 'columnName', e.target.value)} />
                        </div>
                        <div className={styles.roleGrid}>
                          <div className={styles.roleHead} style={{ gridTemplateColumns: '28px 1fr 90px' }}>
                            <span /><span />
                            <span className={styles.roleHeadCell}>{game.columnName || 'Очки'}</span>
                          </div>
                          {form.mmParticipants.map(p => (
                            <div key={p} className={`${styles.roleRow} ${styles.roleRowSimple}`}>
                              <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                              <span className={styles.roleName}>{p}</span>
                              <input className={styles.pointsInput} type="number" min={0} placeholder="0"
                                value={game.points[p] ?? ''}
                                onChange={e => setMMGamePoints(gi, p, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button className={styles.btnOutline} onClick={addMMGame}>+ Добавить игру</button>
                  </div>
                </>
              )}

              <div className={styles.formActions}>
                <button className={styles.btnCancel} onClick={() => { setShowForm(false); setForm(INIT_FORM) }}>Отмена</button>
                <button className={styles.btnNext} disabled={!canGoStep2()} onClick={() => setForm(f => ({ ...f, step: 2 }))}>Далее →</button>
              </div>
            </div>
          )}

          {form.step === 2 && (
            <div className={styles.formBody}>
              <div className={styles.dmHeader}><div className={styles.dmBar} /><span className={styles.matchLabel}>DEATH MATCH</span></div>
              <input className={styles.input} placeholder="Название игры" value={form.dmName}
                onChange={e => setForm(f => ({ ...f, dmName: e.target.value }))} />
              <input className={`${styles.input} ${styles.inputNarrow}`} placeholder="Название столбца (напр. Очки)" value={form.dmColumnName}
                onChange={e => setForm(f => ({ ...f, dmColumnName: e.target.value }))} />
              <p className={styles.hint}>Участники:</p>
              <div className={styles.dmVs}>
                {losers.map(p => (
                  <div key={p} className={styles.dmPlayer}>
                    <span className={styles.dmAvatar}>{initials(p)}</span>
                    <span className={styles.dmName}>{p}</span>
                    <input className={styles.pointsInput} type="number" min={0} placeholder="0"
                      value={form.dmPoints[p] ?? ''}
                      onChange={e => setForm(f => ({ ...f, dmPoints: { ...f.dmPoints, [p]: parseInt(e.target.value) || 0 } }))} />
                    <div className={styles.dmChoices}>
                      <button className={`${styles.dmChoice} ${form.dmWinner === p ? styles.dmChoiceWin : ''}`}
                        onClick={() => setForm(f => ({ ...f, dmWinner: p, dmEliminated: f.dmEliminated === p ? '' : f.dmEliminated }))}>✓ Выжил</button>
                      <button className={`${styles.dmChoice} ${form.dmEliminated === p ? styles.dmChoiceLose : ''}`}
                        onClick={() => setForm(f => ({ ...f, dmEliminated: p, dmWinner: f.dmWinner === p ? '' : f.dmWinner }))}>✗ Вылетел</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.formActions}>
                <button className={styles.btnCancel} onClick={() => setForm(f => ({ ...f, step: 1 }))}>← Назад</button>
                <button className={styles.btnSave} disabled={!canSaveRegular() || saving} onClick={handleSaveRegular}>
                  {saving ? '...' : 'Сохранить раунд'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoundCard({ round, accent, isAdmin, initials, psigems, isLast, isCollapsed, onToggle, onDelete }: {
  round: Round; accent: string; isAdmin: boolean; initials: (n: string) => string
  psigems: Record<string, number>; isLast: boolean; isCollapsed: boolean; onToggle: () => void; onDelete: () => void
}) {
  const mm = round.mainMatch
  const dm = round.deathMatch
  const isFinal = round.type === 'final'
  const mmColName = mm.columnName || 'Очки'
  const dmColName = dm?.columnName || 'Очки'

  function rowRole(p: string): 'winner' | 'loser' | 'none' {
    if (mm.winners.includes(p)) return 'winner'
    if (mm.losers.includes(p)) return 'loser'
    return 'none'
  }

  const mmRanked = mm.points && Object.keys(mm.points).length > 0
    ? [...mm.participants].sort((a, b) => (mm.points![b] ?? 0) - (mm.points![a] ?? 0))
    : mm.participants

  const finalWins: Record<string, number> = {}
  if (isFinal && round.finalGames) {
    for (const g of round.finalGames) { if (g.winner) finalWins[g.winner] = (finalWins[g.winner] ?? 0) + 1 }
  }

  return (
    <div className={`${styles.roundCard} ${isFinal ? styles.finalCard : ''}`}>
      <div className={styles.roundHeader} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div className={styles.roundHeaderLeft}>
          <span className={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
          <span className={styles.roundNum} style={isFinal ? { color: '#FFD700' } : {}}>
            {isFinal ? '🏆 ФИНАЛ' : `РАУНД ${round.number}`}
          </span>
        </div>
        <div className={styles.roundHeaderRight}>
          {isFinal && mm.winners[0] && <span className={styles.finalChampionHeader}>🥇 {mm.winners[0]}</span>}
          {isAdmin && isLast && (
            <button className={styles.deleteRound} onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Final display */}
          {isFinal && round.finalGames && (
            <div className={styles.matchSection}>
              <div className={styles.finalStripe} />
              <div className={styles.matchContent}>
                <div className={styles.finalGamesDisplay}>
                  {round.finalGames.map((g, i) => {
                    const colName = g.columnName || 'Очки'
                    return (
                      <div key={i} className={styles.finalGameDisplay}>
                        <div className={styles.finalGameDisplayHeader}>
                          <span className={styles.finalGameDisplayNum}>Игра {i + 1}</span>
                          {g.name && <span className={styles.matchName}>"{g.name}"</span>}
                        </div>
                        {g.points && Object.keys(g.points).length > 0 && (
                          <div className={styles.rankTable} style={{ marginTop: 8 }}>
                            <div className={styles.rankTableHead}>
                              <span>#</span><span>Игрок</span><span>{colName}</span><span></span>
                            </div>
                            {mm.participants
                              .sort((a, b) => (g.points![b] ?? 0) - (g.points![a] ?? 0))
                              .map((p, ri) => (
                                <div key={p} className={`${styles.rankTableRow} ${g.winner === p ? styles.rowWinner : styles.rowNeutral}`}>
                                  <span className={styles.rankTableNum}>{ri + 1}</span>
                                  <span className={styles.rankTableName}>
                                    <span className={styles.rankTableAvatar} style={
                                      g.winner === p ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' }
                                                     : { background: `${accent}15`, color: accent }
                                    }>{initials(p)}</span>
                                    {p}
                                    {g.winner === p && <span className={styles.wingIcon}>🪶</span>}
                                  </span>
                                  <span className={styles.rankTablePts}>{g.points![p] ?? '—'}</span>
                                  <span />
                                </div>
                              ))}
                          </div>
                        )}
                        {(!g.points || Object.keys(g.points).length === 0) && (
                          <div className={styles.finalGameSimpleResult}>
                            <span style={{ color: '#22c55e' }}>🏆 {g.winner}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div className={styles.finalScoreDisplay}>
                    {mm.participants.map(p => (
                      <span key={p} className={`${styles.finalScoreDisplayItem} ${mm.winners[0] === p ? styles.champion : ''}`}>
                        {p}: {finalWins[p] ?? 0} побед
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Regular: Main Match */}
          {!isFinal && (
            <div className={styles.matchSection}>
              <div className={styles.mmStripe} />
              <div className={styles.matchContent}>
                <div className={styles.matchTitleRow}>
                  <span className={styles.matchType}>MAIN MATCH</span>
                  {mm.name && <span className={styles.matchName}>"{mm.name}"</span>}
                </div>

                {/* New multi-game format */}
                {mm.games && mm.games.length > 0 ? (
                  <div className={styles.mmGamesDisplay}>
                    {mm.games.map((game, gi) => {
                      const colName = game.columnName || 'Очки'
                      const gameRanked = game.points && Object.keys(game.points).length > 0
                        ? [...mm.participants].sort((a, b) => (game.points![b] ?? 0) - (game.points![a] ?? 0))
                        : mm.participants
                      return (
                        <div key={gi} className={styles.mmGameDisplayBlock}>
                          <div className={styles.mmGameDisplayHeader}>
                            <span className={styles.mmGameDisplayNum}>Игра {gi + 1}</span>
                            {game.name && <span className={styles.matchName}>"{game.name}"</span>}
                          </div>
                          <div className={styles.rankTable}>
                            <div className={styles.rankTableHead}>
                              <span>#</span><span>Игрок</span><span>{colName}</span><span>Ψ</span>
                            </div>
                            {gameRanked.map((p, ri) => {
                              const role = rowRole(p)
                              return (
                                <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`}>
                                  <span className={styles.rankTableNum}>{ri + 1}</span>
                                  <span className={styles.rankTableName}>
                                    <span className={styles.rankTableAvatar} style={
                                      role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' }
                                      : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' }
                                      : { background: `${accent}15`, color: accent }
                                    }>{initials(p)}</span>
                                    {p}
                                    {role === 'winner' && <span className={styles.wingIcon}>🪶</span>}
                                  </span>
                                  <span className={styles.rankTablePts}>{game.points?.[p] ?? '—'}</span>
                                  <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Backward compat: old single-game format */
                  <div className={styles.rankTable}>
                    <div className={styles.rankTableHead}>
                      <span>#</span><span>Игрок</span><span>{mmColName}</span><span>Ψ</span>
                    </div>
                    {mmRanked.map((p, i) => {
                      const role = rowRole(p)
                      return (
                        <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`}>
                          <span className={styles.rankTableNum}>{i + 1}</span>
                          <span className={styles.rankTableName}>
                            <span className={styles.rankTableAvatar} style={
                              role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' }
                              : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' }
                              : { background: `${accent}15`, color: accent }
                            }>{initials(p)}</span>
                            {p}
                            {role === 'winner' && <span className={styles.wingIcon}>🪶</span>}
                          </span>
                          <span className={styles.rankTablePts}>{mm.points?.[p] ?? '—'}</span>
                          <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Death Match */}
          {!isFinal && dm && (
            <div className={styles.matchSection}>
              <div className={styles.dmStripe} />
              <div className={styles.matchContent}>
                <div className={styles.matchTitleRow}>
                  <span className={styles.matchTypeDm}>DEATH MATCH</span>
                  <span className={styles.matchName}>"{dm.name}"</span>
                </div>
                <div className={styles.rankTable}>
                  <div className={styles.rankTableHead}>
                    <span>#</span><span>Игрок</span><span>{dmColName}</span><span>Ψ</span>
                  </div>
                  {[...dm.participants].sort((a, b) => dm.winner === a ? -1 : dm.winner === b ? 1 : 0).map((p, i) => {
                    const isWin = p === dm.winner; const isElim = p === dm.eliminated
                    return (
                      <div key={p} className={`${styles.rankTableRow} ${isWin ? styles.rowWinner : styles.rowLoser}`}>
                        <span className={styles.rankTableNum}>{i + 1}</span>
                        <span className={styles.rankTableName}>
                          <span className={styles.rankTableAvatar} style={isWin ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : { background: 'rgba(239,68,68,0.25)', color: '#ef4444' }}>{initials(p)}</span>
                          <span className={isElim ? styles.eliminated : ''}>{p}</span>
                          {isWin && <span className={styles.wingIcon}>🪶</span>}
                        </span>
                        <span className={styles.rankTablePts}>{dm.points?.[p] ?? '—'}</span>
                        <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
