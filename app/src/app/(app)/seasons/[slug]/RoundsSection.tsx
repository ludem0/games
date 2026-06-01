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

interface MMColumnForm {
  name: string
  points: Record<string, number>
}

interface MMGameForm {
  name: string
  collapsed: boolean
  columns: MMColumnForm[]
}

interface FormState {
  mode: 'regular' | 'final'
  mmName: string
  mmParticipants: string[]
  mmRoles: Record<string, MMRole>
  mmPsigemDelta: Record<string, number>
  mmGames: MMGameForm[]
  dmWinner: string
  dmEliminated: string
  dmRounds: MMGameForm[]
  finalGames: FinalGame[]
  finalColumnName: string
  step: 1 | 2
}

const mkGame = (): MMGameForm => ({ name: '', collapsed: false, columns: [{ name: 'Очки', points: {} }] })

const INIT_FORM: FormState = {
  mode: 'regular',
  mmName: '',
  mmParticipants: [],
  mmRoles: {},
  mmPsigemDelta: {},
  mmGames: [mkGame()],
  dmWinner: '',
  dmEliminated: '',
  dmRounds: [mkGame()],
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

// Generic helpers for managing a list of MMGameForm (used for both MM and DM rounds)
function addGame(list: MMGameForm[]): MMGameForm[] {
  return [...list, mkGame()]
}
function removeGame(list: MMGameForm[], idx: number): MMGameForm[] {
  return list.filter((_, i) => i !== idx)
}
function updateGameName(list: MMGameForm[], idx: number, val: string): MMGameForm[] {
  return list.map((g, i) => i === idx ? { ...g, name: val } : g)
}
function toggleGameCollapse(list: MMGameForm[], idx: number): MMGameForm[] {
  return list.map((g, i) => i === idx ? { ...g, collapsed: !g.collapsed } : g)
}
function addColumn(list: MMGameForm[], gameIdx: number): MMGameForm[] {
  return list.map((g, i) => i === gameIdx ? { ...g, columns: [...g.columns, { name: 'Очки', points: {} }] } : g)
}
function removeColumn(list: MMGameForm[], gameIdx: number, colIdx: number): MMGameForm[] {
  return list.map((g, i) => i === gameIdx ? { ...g, columns: g.columns.filter((_, ci) => ci !== colIdx) } : g)
}
function updateColumnName(list: MMGameForm[], gameIdx: number, colIdx: number, val: string): MMGameForm[] {
  return list.map((g, i) => i === gameIdx ? {
    ...g, columns: g.columns.map((c, ci) => ci === colIdx ? { ...c, name: val } : c)
  } : g)
}
function setColumnPoints(list: MMGameForm[], gameIdx: number, colIdx: number, player: string, val: string): MMGameForm[] {
  return list.map((g, i) => i === gameIdx ? {
    ...g, columns: g.columns.map((c, ci) => ci === colIdx ? {
      ...c, points: { ...c.points, [player]: parseInt(val) || 0 }
    } : c)
  } : g)
}

function serializeGames(games: MMGameForm[]) {
  return games.map(g => ({ name: g.name, columns: g.columns.map(c => ({ name: c.name, points: c.points })) }))
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

  // MM game helpers
  const mm = (fn: (list: MMGameForm[]) => MMGameForm[]) => setForm(f => ({ ...f, mmGames: fn(f.mmGames) }))
  // DM round helpers
  const dm = (fn: (list: MMGameForm[]) => MMGameForm[]) => setForm(f => ({ ...f, dmRounds: fn(f.dmRounds) }))

  // Final game management
  function setFinalGameWinner(idx: number, winner: string) {
    setForm(f => {
      const games = [...f.finalGames]; games[idx] = { ...games[idx], winner }; return { ...f, finalGames: games }
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
    return form.dmWinner !== '' && form.dmEliminated !== '' && form.dmWinner !== form.dmEliminated
  }
  function canSaveFinal() {
    return !!getFinalWinner(form.finalGames, availableParticipants) && form.finalGames.length >= 2
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

    const mmData: MainMatch = {
      name: form.mmName,
      participants: form.mmParticipants,
      winners,
      losers,
      games: serializeGames(form.mmGames),
    }
    const dmData: DeathMatch = {
      name: form.dmRounds[0]?.name || '',
      participants: losers,
      winner: form.dmWinner,
      eliminated: form.dmEliminated,
      rounds: serializeGames(form.dmRounds),
    }
    const [roundRes, psiRes] = await Promise.all([
      fetch(`/api/seasons/${slug}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainMatch: mmData, deathMatch: dmData, mmPsigemDelta: form.mmPsigemDelta }),
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
    const mmData: MainMatch = { name: 'Финал', participants: players, winners: [champion], losers: [loser] }
    const finalGamesWithMeta = form.finalGames.map(g => ({ ...g, columnName: form.finalColumnName }))
    const res = await fetch(`/api/seasons/${slug}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'final', mainMatch: mmData, deathMatch: null, finalGames: finalGamesWithMeta }),
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
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recomputed),
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
                        onClick={() => setFinalGameWinner(i, g.winner === p ? '' : p)}>{p}</button>
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
                      <span key={p} className={`${styles.finalScoreItem} ${champion === p ? styles.finalChampion : ''}`}>{p}: {wins[p]}</span>
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
                  <p className={styles.hint}>Раунды матча:</p>
                  <GameRoundsForm
                    games={form.mmGames}
                    players={form.mmParticipants}
                    accent={accent}
                    initials={initials}
                    stripeColor="#4ADE80"
                    onAdd={() => mm(addGame)}
                    onRemove={idx => mm(l => removeGame(l, idx))}
                    onUpdateName={(idx, val) => mm(l => updateGameName(l, idx, val))}
                    onToggleCollapse={idx => mm(l => toggleGameCollapse(l, idx))}
                    onAddColumn={gi => mm(l => addColumn(l, gi))}
                    onRemoveColumn={(gi, ci) => mm(l => removeColumn(l, gi, ci))}
                    onUpdateColumnName={(gi, ci, val) => mm(l => updateColumnName(l, gi, ci, val))}
                    onSetPoints={(gi, ci, p, val) => mm(l => setColumnPoints(l, gi, ci, p, val))}
                  />
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
              <p className={styles.hint}>Раунды матча:</p>
              <GameRoundsForm
                games={form.dmRounds}
                players={losers}
                accent={accent}
                initials={initials}
                stripeColor="#EF4444"
                onAdd={() => dm(addGame)}
                onRemove={idx => dm(l => removeGame(l, idx))}
                onUpdateName={(idx, val) => dm(l => updateGameName(l, idx, val))}
                onToggleCollapse={idx => dm(l => toggleGameCollapse(l, idx))}
                onAddColumn={gi => dm(l => addColumn(l, gi))}
                onRemoveColumn={(gi, ci) => dm(l => removeColumn(l, gi, ci))}
                onUpdateColumnName={(gi, ci, val) => dm(l => updateColumnName(l, gi, ci, val))}
                onSetPoints={(gi, ci, p, val) => dm(l => setColumnPoints(l, gi, ci, p, val))}
              />
              <p className={styles.hint}>Результат:</p>
              <div className={styles.dmVs}>
                {losers.map(p => (
                  <div key={p} className={styles.dmPlayer}>
                    <span className={styles.dmAvatar}>{initials(p)}</span>
                    <span className={styles.dmName}>{p}</span>
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

// Shared sub-component for form game/round list (used by both MM and DM)
function GameRoundsForm({ games, players, accent, initials, stripeColor, onAdd, onRemove, onUpdateName, onToggleCollapse, onAddColumn, onRemoveColumn, onUpdateColumnName, onSetPoints }: {
  games: { name: string; collapsed: boolean; columns: { name: string; points: Record<string, number> }[] }[]
  players: string[]
  accent: string
  initials: (n: string) => string
  stripeColor: string
  onAdd: () => void
  onRemove: (idx: number) => void
  onUpdateName: (idx: number, val: string) => void
  onToggleCollapse: (idx: number) => void
  onAddColumn: (gameIdx: number) => void
  onRemoveColumn: (gameIdx: number, colIdx: number) => void
  onUpdateColumnName: (gameIdx: number, colIdx: number, val: string) => void
  onSetPoints: (gameIdx: number, colIdx: number, player: string, val: string) => void
}) {
  return (
    <div className={styles.mmGamesSection}>
      {games.map((game, gi) => (
        <div key={gi} className={styles.mmGameBlock} style={{ borderColor: `${stripeColor}22` }}>
          <div className={styles.mmGameHeader}>
            <button className={styles.mmGameCollapseBtn} onClick={() => onToggleCollapse(gi)}>
              <span className={styles.mmGameCollapseIcon}>{game.collapsed ? '▶' : '▼'}</span>
              <span className={styles.mmGameNum} style={{ color: stripeColor }}>Раунд {gi + 1}</span>
              {game.name && <span className={styles.mmGameNameLabel}>{game.name}</span>}
            </button>
            {games.length > 1 && (
              <button className={styles.removeGameBtn} onClick={() => onRemove(gi)}>✕</button>
            )}
          </div>
          {!game.collapsed && (
            <>
              <input className={styles.input} placeholder="Название раунда (необязательно)"
                value={game.name} onChange={e => onUpdateName(gi, e.target.value)} />
              {game.columns.map((col, ci) => (
                <div key={ci} className={styles.mmColumnBlock}>
                  <div className={styles.mmColumnHeader}>
                    <input className={`${styles.input} ${styles.inputNarrow}`}
                      placeholder="Название колонки"
                      value={col.name}
                      onChange={e => onUpdateColumnName(gi, ci, e.target.value)} />
                    {game.columns.length > 1 && (
                      <button className={styles.removeGameBtn} onClick={() => onRemoveColumn(gi, ci)}>✕</button>
                    )}
                  </div>
                  <div className={styles.roleGrid}>
                    <div className={styles.roleHead} style={{ gridTemplateColumns: '28px 1fr 90px' }}>
                      <span /><span />
                      <span className={styles.roleHeadCell}>{col.name || 'Очки'}</span>
                    </div>
                    {players.map(p => (
                      <div key={p} className={`${styles.roleRow} ${styles.roleRowSimple}`}>
                        <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                        <span className={styles.roleName}>{p}</span>
                        <input className={styles.pointsInput} type="number" min={0} placeholder="0"
                          value={col.points[p] ?? ''}
                          onChange={e => onSetPoints(gi, ci, p, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button className={styles.btnOutlineSmall} onClick={() => onAddColumn(gi)}>+ Добавить колонку</button>
            </>
          )}
        </div>
      ))}
      <button className={styles.btnOutline} onClick={onAdd}>+ Добавить раунд</button>
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

  const [collapsedMM, setCollapsedMM] = useState<Set<number>>(new Set())
  const [collapsedDM, setCollapsedDM] = useState<Set<number>>(new Set())

  function toggleMM(idx: number) { setCollapsedMM(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }
  function toggleDM(idx: number) { setCollapsedDM(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n }) }

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
                            <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{colName}</span><span></span></div>
                            {mm.participants.sort((a, b) => (g.points![b] ?? 0) - (g.points![a] ?? 0)).map((p, ri) => (
                              <div key={p} className={`${styles.rankTableRow} ${g.winner === p ? styles.rowWinner : styles.rowNeutral}`}>
                                <span className={styles.rankTableNum}>{ri + 1}</span>
                                <span className={styles.rankTableName}>
                                  <span className={styles.rankTableAvatar} style={g.winner === p ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : { background: `${accent}15`, color: accent }}>{initials(p)}</span>
                                  {p}{g.winner === p && <span className={styles.wingIcon}>🪶</span>}
                                </span>
                                <span className={styles.rankTablePts}>{g.points![p] ?? '—'}</span>
                                <span />
                              </div>
                            ))}
                          </div>
                        )}
                        {(!g.points || Object.keys(g.points).length === 0) && (
                          <div className={styles.finalGameSimpleResult}><span style={{ color: '#22c55e' }}>🏆 {g.winner}</span></div>
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
                  {mm.name && <span className={styles.matchNameAccent}>{mm.name}</span>}
                </div>
                <SubRoundsDisplay
                  games={mm.games}
                  participants={mm.participants}
                  accent={accent}
                  initials={initials}
                  psigems={psigems}
                  rowRole={rowRole}
                  collapsedSet={collapsedMM}
                  onToggle={toggleMM}
                  numLabel="Раунд"
                  numColor="#4ADE80"
                  fallback={
                    <div className={styles.rankTable}>
                      <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{mmColName}</span><span>Ψ</span></div>
                      {mmRanked.map((p, i) => {
                        const role = rowRole(p)
                        return (
                          <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`}>
                            <span className={styles.rankTableNum}>{i + 1}</span>
                            <span className={styles.rankTableName}>
                              <span className={styles.rankTableAvatar} style={role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' } : { background: `${accent}15`, color: accent }}>{initials(p)}</span>
                              {p}{role === 'winner' && <span className={styles.wingIcon}>🪶</span>}
                            </span>
                            <span className={styles.rankTablePts}>{mm.points?.[p] ?? '—'}</span>
                            <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                          </div>
                        )
                      })}
                    </div>
                  }
                />
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
                  {dm.name && <span className={styles.matchNameAccent} style={{ color: '#EF4444' }}>{dm.name}</span>}
                </div>
                <SubRoundsDisplay
                  games={dm.rounds}
                  participants={dm.participants}
                  accent={accent}
                  initials={initials}
                  psigems={psigems}
                  rowRole={p => p === dm.winner ? 'winner' : p === dm.eliminated ? 'loser' : 'none'}
                  collapsedSet={collapsedDM}
                  onToggle={toggleDM}
                  numLabel="Раунд"
                  numColor="#EF4444"
                  fallback={
                    <div className={styles.rankTable}>
                      <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{dmColName}</span><span>Ψ</span></div>
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
                  }
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Shared sub-rounds display (used by both MM and DM in RoundCard)
function SubRoundsDisplay({ games, participants, accent, initials, psigems, rowRole, collapsedSet, onToggle, numLabel, numColor, fallback }: {
  games?: { name: string; columns?: { name: string; points?: Record<string, number> }[] }[]
  participants: string[]
  accent: string
  initials: (n: string) => string
  psigems: Record<string, number>
  rowRole: (p: string) => 'winner' | 'loser' | 'none'
  collapsedSet: Set<number>
  onToggle: (idx: number) => void
  numLabel: string
  numColor: string
  fallback: React.ReactNode
}) {
  if (!games || games.length === 0) return <>{fallback}</>

  return (
    <div className={styles.mmGamesDisplay}>
      {games.map((game, gi) => {
        const isCollapsed = collapsedSet.has(gi)
        const cols = game.columns && game.columns.length > 0 ? game.columns : []
        const nCols = cols.length
        const gridTemplate = `28px 2fr ${Array(nCols).fill('1fr').join(' ')} 55px`

        const gameRanked = nCols > 0 && cols.some(c => c.points && Object.keys(c.points).length > 0)
          ? [...participants].sort((a, b) => {
              const tA = cols.reduce((s, c) => s + (c.points?.[a] ?? 0), 0)
              const tB = cols.reduce((s, c) => s + (c.points?.[b] ?? 0), 0)
              return tB - tA
            })
          : participants

        return (
          <div key={gi} className={styles.mmGameDisplayBlock}>
            <div className={styles.mmGameDisplayHeader} onClick={() => onToggle(gi)} style={{ cursor: 'pointer' }}>
              <span className={styles.mmSubRoundCollapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
              <span className={styles.mmGameDisplayNum} style={{ color: numColor }}>{numLabel} {gi + 1}</span>
              {game.name && <span className={styles.mmSubRoundNameDisplay}>{game.name}</span>}
            </div>
            {!isCollapsed && nCols > 0 && (
              <div className={styles.rankTable}>
                <div className={styles.rankTableHead} style={{ gridTemplateColumns: gridTemplate }}>
                  <span>#</span><span>Игрок</span>
                  {cols.map((c, ci) => <span key={ci}>{c.name || 'Очки'}</span>)}
                  <span>Ψ</span>
                </div>
                {gameRanked.map((p, ri) => {
                  const role = rowRole(p)
                  return (
                    <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`}
                      style={{ gridTemplateColumns: gridTemplate }}>
                      <span className={styles.rankTableNum}>{ri + 1}</span>
                      <span className={styles.rankTableName}>
                        <span className={styles.rankTableAvatar} style={
                          role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' }
                          : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' }
                          : { background: `${accent}15`, color: accent }
                        }>{initials(p)}</span>
                        {p}{role === 'winner' && <span className={styles.wingIcon}>🪶</span>}
                      </span>
                      {cols.map((c, ci) => <span key={ci} className={styles.rankTablePts}>{c.points?.[p] ?? '—'}</span>)}
                      <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                    </div>
                  )
                })}
              </div>
            )}
            {!isCollapsed && nCols === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '4px 0' }}>Нет данных</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
