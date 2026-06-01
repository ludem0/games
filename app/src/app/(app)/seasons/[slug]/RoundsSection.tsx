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

interface MMColumnForm { name: string; points: Record<string, number> }
interface MMGameForm { name: string; collapsed: boolean; columns: MMColumnForm[] }
interface DMForm {
  name: string
  participants: string[]
  winner: string
  eliminated: string
  rounds: MMGameForm[]
}

interface FormState {
  mode: 'regular' | 'final'
  mmName: string
  mmParticipants: string[]
  mmRoles: Record<string, MMRole>
  mmPsigemDelta: Record<string, number>
  mmGames: MMGameForm[]
  deathMatches: DMForm[]
  finalGames: FinalGame[]
  finalColumnName: string
  step: 1 | 2
}

const mkGame = (): MMGameForm => ({ name: '', collapsed: false, columns: [{ name: 'Очки', points: {} }] })
const mkDM = (participants: string[] = []): DMForm => ({ name: '', participants, winner: '', eliminated: '', rounds: [mkGame()] })

const INIT_FORM: FormState = {
  mode: 'regular',
  mmName: '',
  mmParticipants: [],
  mmRoles: {},
  mmPsigemDelta: {},
  mmGames: [],
  deathMatches: [],
  finalGames: [],
  finalColumnName: 'Очки',
  step: 1,
}

// ── pure list helpers ──────────────────────────────────────────────────────────
function addGame(l: MMGameForm[]) { return [...l, mkGame()] }
function removeGame(l: MMGameForm[], i: number) { return l.filter((_, j) => j !== i) }
function updateGameName(l: MMGameForm[], i: number, v: string) { return l.map((g, j) => j === i ? { ...g, name: v } : g) }
function toggleGameCollapse(l: MMGameForm[], i: number) { return l.map((g, j) => j === i ? { ...g, collapsed: !g.collapsed } : g) }
function addColumn(l: MMGameForm[], gi: number) { return l.map((g, j) => j === gi ? { ...g, columns: [...g.columns, { name: 'Очки', points: {} }] } : g) }
function removeColumn(l: MMGameForm[], gi: number, ci: number) { return l.map((g, j) => j === gi ? { ...g, columns: g.columns.filter((_, k) => k !== ci) } : g) }
function updateColumnName(l: MMGameForm[], gi: number, ci: number, v: string) { return l.map((g, j) => j === gi ? { ...g, columns: g.columns.map((c, k) => k === ci ? { ...c, name: v } : c) } : g) }
function setColumnPoints(l: MMGameForm[], gi: number, ci: number, p: string, v: string) { return l.map((g, j) => j === gi ? { ...g, columns: g.columns.map((c, k) => k === ci ? { ...c, points: { ...c.points, [p]: parseInt(v) || 0 } } : c) } : g) }
function serializeGames(gs: MMGameForm[]) { return gs.map(g => ({ name: g.name, columns: g.columns.map(c => ({ name: c.name, points: c.points })) })) }

function recomputePsigems(participants: string[], rounds: Round[]): Record<string, number> {
  const r: Record<string, number> = Object.fromEntries(participants.map(p => [p, 1]))
  for (const round of rounds) {
    for (const [n, d] of Object.entries(round.mmPsigemDelta ?? {})) r[n] = Math.max(0, (r[n] ?? 1) + d)
    const dms = round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
    for (const dm of dms) {
      if (!dm.winner || !dm.eliminated) continue
      const ePsi = r[dm.eliminated] ?? 0
      r[dm.winner] = (r[dm.winner] ?? 1) + ePsi
      r[dm.eliminated] = 0
    }
  }
  return r
}

function toGameForms(games?: { name: string; columns?: { name: string; points?: Record<string, number> }[]; columnName?: string; points?: Record<string, number> }[]): MMGameForm[] {
  if (!games || games.length === 0) return []
  return games.map(g => ({
    name: g.name, collapsed: false,
    columns: g.columns && g.columns.length > 0
      ? g.columns.map(c => ({ name: c.name, points: c.points ?? {} }))
      : g.columnName ? [{ name: g.columnName, points: g.points ?? {} }]
      : [{ name: 'Очки', points: {} }]
  }))
}

function roundToFormState(round: Round): FormState {
  const mm = round.mainMatch
  const dmsRaw = round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
  const mmRoles: Record<string, MMRole> = {}
  for (const p of mm.winners ?? []) mmRoles[p] = 'winner'
  for (const p of mm.losers ?? []) mmRoles[p] = 'loser'
  const mmGames = mm.games?.length ? toGameForms(mm.games) : mm.points ? [{ name: '', collapsed: false, columns: [{ name: mm.columnName || 'Очки', points: mm.points }] }] : []
  const dmForms: DMForm[] = dmsRaw.length > 0
    ? dmsRaw.map(dm => ({ name: dm.name || '', participants: dm.participants, winner: dm.winner, eliminated: dm.eliminated, rounds: dm.rounds?.length ? toGameForms(dm.rounds) : dm.points ? [{ name: '', collapsed: false, columns: [{ name: dm.columnName || 'Очки', points: dm.points }] }] : [mkGame()] }))
    : [mkDM()]
  return {
    mode: round.type === 'final' ? 'final' : 'regular',
    mmName: mm.name, mmParticipants: mm.participants, mmRoles, mmPsigemDelta: round.mmPsigemDelta ?? {},
    mmGames, deathMatches: dmForms,
    finalGames: round.finalGames ?? [], finalColumnName: round.finalGames?.[0]?.columnName ?? 'Очки', step: 1,
  }
}

export default function RoundsSection({ slug, accent, isAdmin, initialRounds, participants, psigems: initialPsigems }: Props) {
  const [rounds, setRounds] = useState<Round[]>(initialRounds)
  const [psigems, setPsigems] = useState(initialPsigems)
  const [showForm, setShowForm] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(initialRounds.map(r => r.id)))
  const [form, setForm] = useState<FormState>(INIT_FORM)
  const [saving, setSaving] = useState(false)
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null)

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  const eliminatedPlayers = useMemo(() =>
    rounds.flatMap(r => {
      const dms = r.deathMatches ?? (r.deathMatch ? [r.deathMatch] : [])
      return dms.map(dm => dm.eliminated).filter(Boolean) as string[]
    }), [rounds])

  const availableParticipants = participants.filter(p => !eliminatedPlayers.includes(p))
  const isFinalTime = availableParticipants.length === 2
  const finalExists = rounds.some(r => r.type === 'final')
  const losers = form.mmParticipants.filter(p => form.mmRoles[p] === 'loser')
  const winners = form.mmParticipants.filter(p => form.mmRoles[p] === 'winner')

  function toggleCollapse(id: string) { setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  function toggleMMParticipant(name: string) {
    setForm(f => {
      const has = f.mmParticipants.includes(name)
      return { ...f, mmParticipants: has ? f.mmParticipants.filter(p => p !== name) : [...f.mmParticipants, name], mmRoles: has ? Object.fromEntries(Object.entries(f.mmRoles).filter(([k]) => k !== name)) : f.mmRoles }
    })
  }
  function setRole(name: string, role: MMRole) { setForm(f => ({ ...f, mmRoles: { ...f.mmRoles, [name]: role } })) }
  function adjustPsi(name: string, delta: number) { setForm(f => ({ ...f, mmPsigemDelta: { ...f.mmPsigemDelta, [name]: (f.mmPsigemDelta[name] ?? 0) + delta } })) }

  const mm = (fn: (l: MMGameForm[]) => MMGameForm[]) => setForm(f => ({ ...f, mmGames: fn(f.mmGames) }))

  // DM management
  function addDM() { setForm(f => ({ ...f, deathMatches: [...f.deathMatches, mkDM()] })) }
  function removeDM(i: number) { setForm(f => ({ ...f, deathMatches: f.deathMatches.filter((_, j) => j !== i) })) }
  function toggleDMParticipant(di: number, p: string) {
    setForm(f => {
      const dms = f.deathMatches.map((dm, i) => {
        if (i === di) {
          const has = dm.participants.includes(p)
          return { ...dm, participants: has ? dm.participants.filter(x => x !== p) : [...dm.participants, p], winner: has && dm.winner === p ? '' : dm.winner, eliminated: has && dm.eliminated === p ? '' : dm.eliminated }
        }
        // Remove from other DMs when claiming for this DM
        if (dm.participants.includes(p)) {
          return { ...dm, participants: dm.participants.filter(x => x !== p), winner: dm.winner === p ? '' : dm.winner, eliminated: dm.eliminated === p ? '' : dm.eliminated }
        }
        return dm
      })
      return { ...f, deathMatches: dms }
    })
  }
  function setDMName(di: number, v: string) {
    setForm(f => { const dms = [...f.deathMatches]; dms[di] = { ...dms[di], name: v }; return { ...f, deathMatches: dms } })
  }
  function setDMWinner(di: number, p: string) {
    setForm(f => { const dms = [...f.deathMatches]; dms[di] = { ...dms[di], winner: p, eliminated: dms[di].eliminated === p ? '' : dms[di].eliminated }; return { ...f, deathMatches: dms } })
  }
  function setDMEliminated(di: number, p: string) {
    setForm(f => { const dms = [...f.deathMatches]; dms[di] = { ...dms[di], eliminated: p, winner: dms[di].winner === p ? '' : dms[di].winner }; return { ...f, deathMatches: dms } })
  }
  function dmRoundsHelper(di: number, fn: (l: MMGameForm[]) => MMGameForm[]) {
    setForm(f => { const dms = [...f.deathMatches]; dms[di] = { ...dms[di], rounds: fn(dms[di].rounds) }; return { ...f, deathMatches: dms } })
  }

  // Final
  function setFinalGameWinner(i: number, w: string) { setForm(f => { const g = [...f.finalGames]; g[i] = { ...g[i], winner: w }; return { ...f, finalGames: g } }) }
  function setFinalGamePoints(i: number, p: string, v: string) { setForm(f => { const g = [...f.finalGames]; g[i] = { ...g[i], points: { ...(g[i].points ?? {}), [p]: parseInt(v) || 0 } }; return { ...f, finalGames: g } }) }
  function addFinalGame(name: string) { setForm(f => ({ ...f, finalGames: [...f.finalGames, { name, winner: '', points: {}, columnName: f.finalColumnName }] })) }
  function getFinalWinner(games: { winner: string }[], players: string[]) {
    const wins = Object.fromEntries(players.map(p => [p, 0]))
    games.forEach(g => { if (g.winner) wins[g.winner] = (wins[g.winner] ?? 0) + 1 })
    return players.find(p => wins[p] >= 2) ?? null
  }

  function canGoStep2() { return form.mmParticipants.length > 0 && losers.length > 0 && winners.length > 0 }
  function canSaveRegular() {
    if (form.deathMatches.length === 0) return true
    return form.deathMatches.every(dm => dm.participants.length >= 2 && dm.winner && dm.eliminated && dm.winner !== dm.eliminated && dm.participants.includes(dm.winner) && dm.participants.includes(dm.eliminated))
  }
  function canSaveFinal() { return !!getFinalWinner(form.finalGames, availableParticipants) && form.finalGames.length >= 2 }

  async function handleSaveRegular() {
    if (!canSaveRegular()) return
    setSaving(true)
    const newPsi = { ...psigems }
    for (const [n, d] of Object.entries(form.mmPsigemDelta)) newPsi[n] = Math.max(0, (newPsi[n] ?? 1) + d)
    for (const dm of form.deathMatches) {
      if (dm.winner && dm.eliminated) {
        const ePsi = newPsi[dm.eliminated] ?? 1
        newPsi[dm.winner] = (newPsi[dm.winner] ?? 1) + ePsi
        newPsi[dm.eliminated] = 0
      }
    }
    const mmData: MainMatch = { name: form.mmName, participants: form.mmParticipants, winners, losers, games: serializeGames(form.mmGames) }
    const dmArr = form.deathMatches.map(dm => ({ name: dm.name, participants: dm.participants, winner: dm.winner, eliminated: dm.eliminated, rounds: serializeGames(dm.rounds) }))
    const [roundRes, psiRes] = await Promise.all([
      fetch(`/api/seasons/${slug}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mainMatch: mmData, deathMatch: null, deathMatches: dmArr, mmPsigemDelta: form.mmPsigemDelta }) }),
      fetch(`/api/seasons/${slug}/psigems`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPsi) }),
    ])
    if (roundRes.ok) { const r = await roundRes.json(); setRounds(p => [...p, r]); setCollapsed(p => new Set([...p, r.id])) }
    if (psiRes.ok) setPsigems(await psiRes.json())
    setSaving(false); setShowForm(false); setForm(INIT_FORM)
  }

  async function handleSaveFinal() {
    if (!canSaveFinal()) return
    setSaving(true)
    const players = availableParticipants
    const champion = getFinalWinner(form.finalGames, players)!
    const loser = players.find(p => p !== champion)!
    const newPsi = { ...psigems }
    for (const [n, d] of Object.entries(form.mmPsigemDelta)) newPsi[n] = Math.max(0, (newPsi[n] ?? 1) + d)
    const mmData: MainMatch = { name: 'Финал', participants: players, winners: [champion], losers: [loser] }
    const res = await fetch(`/api/seasons/${slug}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'final', mainMatch: mmData, deathMatch: null, finalGames: form.finalGames.map(g => ({ ...g, columnName: form.finalColumnName })) }) })
    if (res.ok) { const r = await res.json(); setRounds(p => [...p, r]); setCollapsed(p => new Set([...p, r.id])) }
    await fetch(`/api/seasons/${slug}/psigems`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPsi) })
    setSaving(false); setShowForm(false); setForm(INIT_FORM)
  }

  function handleStartEdit(round: Round) { setForm(roundToFormState(round)); setEditingRoundId(round.id); setShowForm(false) }
  function handleCancelEdit() { setEditingRoundId(null); setForm(INIT_FORM) }

  async function handleEditSave() {
    if (!editingRoundId) return
    setSaving(true)
    const editLosers = form.mmParticipants.filter(p => form.mmRoles[p] === 'loser')
    const editWinners = form.mmParticipants.filter(p => form.mmRoles[p] === 'winner')
    let body: Record<string, unknown>
    if (form.mode === 'regular') {
      body = {
        mainMatch: { name: form.mmName, participants: form.mmParticipants, winners: editWinners, losers: editLosers, games: serializeGames(form.mmGames) },
        deathMatch: null,
        deathMatches: form.deathMatches.map(dm => ({ name: dm.name, participants: dm.participants, winner: dm.winner, eliminated: dm.eliminated, rounds: serializeGames(dm.rounds) })),
        mmPsigemDelta: form.mmPsigemDelta,
      }
    } else {
      const ch = getFinalWinner(form.finalGames, form.mmParticipants)
      const lo = form.mmParticipants.find(p => p !== ch)
      body = { mainMatch: { name: 'Финал', participants: form.mmParticipants, winners: ch ? [ch] : [], losers: lo ? [lo] : [] }, deathMatch: null, finalGames: form.finalGames.map(g => ({ ...g, columnName: form.finalColumnName })) }
    }
    await fetch(`/api/seasons/${slug}/rounds/${editingRoundId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const updated = rounds.map(r => r.id === editingRoundId ? { ...r, ...body } as Round : r)
    setRounds(updated)
    const recomputed = recomputePsigems(participants, updated)
    setPsigems(recomputed)
    await fetch(`/api/seasons/${slug}/psigems`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recomputed) })
    setSaving(false); setEditingRoundId(null); setForm(INIT_FORM)
  }

  async function handleDelete(round: Round) {
    if (!confirm(`Удалить ${round.type === 'final' ? 'Финал' : `Раунд ${round.number}`}?`)) return
    await fetch(`/api/seasons/${slug}/rounds/${round.id}`, { method: 'DELETE' })
    const remaining = rounds.filter(r => r.id !== round.id).map((r, i) => ({ ...r, number: i + 1 }))
    setRounds(remaining)
    const recomputed = recomputePsigems(participants, remaining)
    setPsigems(recomputed)
    await fetch(`/api/seasons/${slug}/psigems`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recomputed) })
  }

  const [newGameName, setNewGameName] = useState('')

  function goToStep2() {
    setForm(f => {
      const alreadyPopulated = f.deathMatches.length > 0 && f.deathMatches.some(d => d.participants.length > 0)
      return { ...f, step: 2, deathMatches: alreadyPopulated ? f.deathMatches : [mkDM(f.mmParticipants.filter(p => f.mmRoles[p] === 'loser'))] }
    })
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>РАУНДЫ</span>
        {isAdmin && !showForm && !editingRoundId && !finalExists && (
          <button className={styles.btnOutline} onClick={() => { setForm({ ...INIT_FORM, mode: isFinalTime ? 'final' : 'regular' }); setShowForm(true) }}>
            {isFinalTime ? '🏆 Добавить финал' : '+ Добавить раунд'}
          </button>
        )}
      </div>

      {rounds.length === 0 && !showForm && <p className={styles.empty}>Раунды ещё не добавлены</p>}

      <div className={styles.roundsList}>
        {rounds.map((round, idx) => (
          editingRoundId === round.id ? (
            <InlineEditForm key={round.id} round={round} form={form} setForm={setForm} accent={accent} initials={initials} psigems={psigems} losers={form.mmParticipants.filter(p => form.mmRoles[p] === 'loser')} winners={form.mmParticipants.filter(p => form.mmRoles[p] === 'winner')} saving={saving} mm={mm} adjustPsi={adjustPsi} setRole={setRole} toggleMMParticipant={toggleMMParticipant} getFinalWinner={getFinalWinner} addDM={addDM} removeDM={removeDM} setDMName={setDMName} toggleDMParticipant={toggleDMParticipant} setDMWinner={setDMWinner} setDMEliminated={setDMEliminated} dmRoundsHelper={dmRoundsHelper} goToStep2={goToStep2} onSave={handleEditSave} onCancel={handleCancelEdit} />
          ) : (
            <RoundCard key={round.id} round={round} accent={accent} isAdmin={isAdmin} initials={initials} psigems={psigems} isLast={idx === rounds.length - 1} isCollapsed={collapsed.has(round.id)} onToggle={() => toggleCollapse(round.id)} onDelete={() => handleDelete(round)} onEdit={isAdmin && !editingRoundId ? () => handleStartEdit(round) : undefined} />
          )
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
            <input className={`${styles.input} ${styles.inputNarrow}`} placeholder="Название столбца" value={form.finalColumnName} onChange={e => setForm(f => ({ ...f, finalColumnName: e.target.value }))} />
            <FinalGamesForm games={form.finalGames} players={availableParticipants} setFinalGameWinner={setFinalGameWinner} setFinalGamePoints={setFinalGamePoints} getFinalWinner={getFinalWinner} newGameName={newGameName} setNewGameName={setNewGameName} addFinalGame={addFinalGame} />
            {form.finalGames.length > 0 && <>
              <p className={styles.hint}>Псигемы:</p>
              <div className={styles.roleGrid}>
                {availableParticipants.map(p => { const cur = (psigems[p] ?? 1) + (form.mmPsigemDelta[p] ?? 0); return (
                  <div key={p} className={`${styles.roleRow} ${styles.roleRowSimple}`}>
                    <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                    <span className={styles.roleName}>{p}</span>
                    <div className={styles.psiInline}><button className={styles.psiSmBtn} onClick={() => adjustPsi(p, -1)}>−</button><span className={styles.psiSmVal}>{cur}</span><button className={styles.psiSmBtn} onClick={() => adjustPsi(p, 1)}>+</button></div>
                  </div>
                )})}
              </div>
            </>}
            <div className={styles.formActions}>
              <button className={styles.btnCancel} onClick={() => { setShowForm(false); setForm(INIT_FORM) }}>Отмена</button>
              <button className={styles.btnSave} disabled={!canSaveFinal() || saving} onClick={handleSaveFinal}>{saving ? '...' : 'Сохранить финал'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Regular round form */}
      {showForm && form.mode === 'regular' && (
        <RegularRoundForm
          roundNum={rounds.length + 1}
          form={form} setForm={setForm} accent={accent} initials={initials} psigems={psigems}
          availableParticipants={availableParticipants} losers={losers} winners={winners}
          saving={saving} mm={mm} adjustPsi={adjustPsi} setRole={setRole} toggleMMParticipant={toggleMMParticipant}
          canGoStep2={canGoStep2} canSaveRegular={canSaveRegular}
          goToStep2={goToStep2} addDM={addDM} removeDM={removeDM} setDMName={setDMName}
          toggleDMParticipant={toggleDMParticipant} setDMWinner={setDMWinner} setDMEliminated={setDMEliminated} dmRoundsHelper={dmRoundsHelper}
          onSave={handleSaveRegular} onCancel={() => { setShowForm(false); setForm(INIT_FORM) }}
        />
      )}
    </div>
  )
}

// ── Shared form components ────────────────────────────────────────────────────

interface RegularFormProps {
  roundNum?: number
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>
  accent: string; initials: (n: string) => string; psigems: Record<string, number>
  availableParticipants: string[]; losers: string[]; winners: string[]
  saving: boolean
  mm: (fn: (l: MMGameForm[]) => MMGameForm[]) => void
  adjustPsi: (name: string, delta: number) => void
  setRole: (name: string, role: MMRole) => void
  toggleMMParticipant: (name: string) => void
  canGoStep2: () => boolean; canSaveRegular: () => boolean
  goToStep2: () => void
  addDM: () => void; removeDM: (i: number) => void; setDMName: (di: number, v: string) => void
  toggleDMParticipant: (di: number, p: string) => void
  setDMWinner: (di: number, p: string) => void; setDMEliminated: (di: number, p: string) => void
  dmRoundsHelper: (di: number, fn: (l: MMGameForm[]) => MMGameForm[]) => void
  onSave: () => void; onCancel: () => void
}

function RegularRoundForm({ roundNum, form, setForm, accent, initials, psigems, availableParticipants, losers, winners, saving, mm, adjustPsi, setRole, toggleMMParticipant, canGoStep2, canSaveRegular, goToStep2, addDM, removeDM, setDMName, toggleDMParticipant, setDMWinner, setDMEliminated, dmRoundsHelper, onSave, onCancel }: RegularFormProps) {
  const isEdit = roundNum === undefined
  return (
    <div className={styles.formCard} style={isEdit ? { borderColor: 'rgba(176,38,255,0.3)' } : {}}>
      <div className={styles.formHeader}>
        <span className={styles.formTitle}>{isEdit ? 'Редактировать раунд' : `Раунд ${roundNum}`}</span>
        <div className={styles.steps}>
          <span className={`${styles.step} ${form.step === 1 ? styles.stepActive : styles.stepDone}`}>1 Main Match</span>
          <span className={styles.stepArrow}>→</span>
          <span className={`${styles.step} ${form.step === 2 ? styles.stepActive : ''}`}>2 Death Match</span>
        </div>
      </div>

      {form.step === 1 && (
        <div className={styles.formBody}>
          <div className={styles.mmHeader}><div className={styles.mmBar} /><span className={styles.matchLabel}>MAIN MATCH</span></div>
          <input className={styles.input} placeholder="Название матча (необязательно)" value={form.mmName} onChange={e => setForm(f => ({ ...f, mmName: e.target.value }))} />
          <p className={styles.hint}>Участники:</p>
          <div className={styles.chipGrid}>
            {availableParticipants.map(p => (
              <button key={p} className={`${styles.chip} ${form.mmParticipants.includes(p) ? styles.chipSelected : ''}`} onClick={() => toggleMMParticipant(p)}>{p}</button>
            ))}
          </div>
          {form.mmParticipants.length > 0 && <>
            <p className={styles.hint}>Роли / Псигемы:</p>
            <div className={styles.roleGrid}>
              <div className={styles.roleHead} style={{ gridTemplateColumns: '28px 1fr 90px 70px' }}><span /><span /><span className={styles.roleHeadCell}>Ψ</span><span className={styles.roleHeadCell}>Роль</span></div>
              {form.mmParticipants.map(p => { const cur = (psigems[p] ?? 1) + (form.mmPsigemDelta[p] ?? 0); return (
                <div key={p} className={styles.roleRow} style={{ gridTemplateColumns: '28px 1fr 90px 70px' }}>
                  <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                  <span className={styles.roleName}>{p}</span>
                  <div className={styles.psiInline}><button className={styles.psiSmBtn} onClick={() => adjustPsi(p, -1)}>−</button><span className={styles.psiSmVal}>{cur}</span><button className={styles.psiSmBtn} onClick={() => adjustPsi(p, 1)}>+</button></div>
                  <div className={styles.roleBtns}>
                    <button className={`${styles.roleBtn} ${form.mmRoles[p] === 'winner' ? styles.roleBtnWin : ''}`} onClick={() => setRole(p, form.mmRoles[p] === 'winner' ? 'none' : 'winner')}>🏆</button>
                    <button className={`${styles.roleBtn} ${form.mmRoles[p] === 'loser' ? styles.roleBtnLose : ''}`} onClick={() => setRole(p, form.mmRoles[p] === 'loser' ? 'none' : 'loser')}>⚔️</button>
                  </div>
                </div>
              )})}
            </div>
            <p className={styles.hint}>Раунды матча (необязательно):</p>
            <GameRoundsForm games={form.mmGames} players={form.mmParticipants} accent={accent} initials={initials} stripeColor="#4ADE80"
              onAdd={() => mm(addGame)} onRemove={i => mm(l => removeGame(l, i))} onUpdateName={(i, v) => mm(l => updateGameName(l, i, v))}
              onToggleCollapse={i => mm(l => toggleGameCollapse(l, i))} onAddColumn={gi => mm(l => addColumn(l, gi))}
              onRemoveColumn={(gi, ci) => mm(l => removeColumn(l, gi, ci))} onUpdateColumnName={(gi, ci, v) => mm(l => updateColumnName(l, gi, ci, v))}
              onSetPoints={(gi, ci, p, v) => mm(l => setColumnPoints(l, gi, ci, p, v))} />
          </>}
          <div className={styles.formActions}>
            <button className={styles.btnCancel} onClick={onCancel}>Отмена</button>
            <button className={styles.btnNext} disabled={!canGoStep2()} onClick={goToStep2}>Далее →</button>
          </div>
        </div>
      )}

      {form.step === 2 && (
        <div className={styles.formBody}>
          <div className={styles.dmHeader}><div className={styles.dmBar} /><span className={styles.matchLabel}>DEATH MATCH</span></div>
          <DMMatchesList form={form} losers={losers} accent={accent} initials={initials}
            addDM={addDM} removeDM={removeDM} setDMName={setDMName} toggleDMParticipant={toggleDMParticipant}
            setDMWinner={setDMWinner} setDMEliminated={setDMEliminated} dmRoundsHelper={dmRoundsHelper} />
          <div className={styles.formActions}>
            <button className={styles.btnCancel} onClick={() => setForm(f => ({ ...f, step: 1 }))}>← Назад</button>
            <button className={styles.btnSave} disabled={!canSaveRegular() || saving} onClick={onSave}>{saving ? '...' : (isEdit ? 'Сохранить изменения' : 'Сохранить раунд')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DMMatchesList({ form, losers, accent, initials, addDM, removeDM, setDMName, toggleDMParticipant, setDMWinner, setDMEliminated, dmRoundsHelper }: {
  form: FormState; losers: string[]; accent: string; initials: (n: string) => string
  addDM: () => void; removeDM: (i: number) => void; setDMName: (di: number, v: string) => void
  toggleDMParticipant: (di: number, p: string) => void
  setDMWinner: (di: number, p: string) => void; setDMEliminated: (di: number, p: string) => void
  dmRoundsHelper: (di: number, fn: (l: MMGameForm[]) => MMGameForm[]) => void
}) {
  return (
    <div className={styles.dmMatchesList}>
      {form.deathMatches.map((dmForm, di) => {
        const assignedElsewhere = form.deathMatches.flatMap((d, i) => i !== di ? d.participants : [])
        return (
          <div key={di} className={styles.dmMatchBlock}>
            <div className={styles.dmMatchHeader}>
              <span className={styles.dmMatchLabel}>DM {form.deathMatches.length > 1 ? di + 1 : ''}</span>
              {form.deathMatches.length > 1 && <button className={styles.removeGameBtn} onClick={() => removeDM(di)}>✕</button>}
            </div>
            <input className={styles.input} placeholder="Название DM (необязательно)" value={dmForm.name} onChange={e => setDMName(di, e.target.value)} />
            <p className={styles.hint}>Участники:</p>
            <div className={styles.chipGrid}>
              {losers.map(p => (
                <button key={p}
                  className={`${styles.chip} ${dmForm.participants.includes(p) ? styles.chipSelected : ''} ${assignedElsewhere.includes(p) ? styles.chipOtherDm : ''}`}
                  onClick={() => toggleDMParticipant(di, p)}>{p}</button>
              ))}
            </div>
            {dmForm.participants.length >= 1 && <>
              <p className={styles.hint}>Раунды (необязательно):</p>
              <GameRoundsForm games={dmForm.rounds} players={dmForm.participants} accent={accent} initials={initials} stripeColor="#EF4444"
                onAdd={() => dmRoundsHelper(di, addGame)} onRemove={i => dmRoundsHelper(di, l => removeGame(l, i))}
                onUpdateName={(i, v) => dmRoundsHelper(di, l => updateGameName(l, i, v))}
                onToggleCollapse={i => dmRoundsHelper(di, l => toggleGameCollapse(l, i))}
                onAddColumn={gi => dmRoundsHelper(di, l => addColumn(l, gi))}
                onRemoveColumn={(gi, ci) => dmRoundsHelper(di, l => removeColumn(l, gi, ci))}
                onUpdateColumnName={(gi, ci, v) => dmRoundsHelper(di, l => updateColumnName(l, gi, ci, v))}
                onSetPoints={(gi, ci, p, v) => dmRoundsHelper(di, l => setColumnPoints(l, gi, ci, p, v))} />
              <p className={styles.hint}>Результат:</p>
              <div className={styles.dmVs}>
                {dmForm.participants.map(p => (
                  <div key={p} className={styles.dmPlayer}>
                    <span className={styles.dmAvatar}>{initials(p)}</span>
                    <span className={styles.dmName}>{p}</span>
                    <div className={styles.dmChoices}>
                      <button className={`${styles.dmChoice} ${dmForm.winner === p ? styles.dmChoiceWin : ''}`} onClick={() => setDMWinner(di, p)}>✓ Выжил</button>
                      <button className={`${styles.dmChoice} ${dmForm.eliminated === p ? styles.dmChoiceLose : ''}`} onClick={() => setDMEliminated(di, p)}>✗ Вылетел</button>
                    </div>
                  </div>
                ))}
              </div>
            </>}
          </div>
        )
      })}
      <button className={styles.btnOutline} onClick={addDM}>+ Добавить DM</button>
    </div>
  )
}

function FinalGamesForm({ games, players, setFinalGameWinner, setFinalGamePoints, getFinalWinner, newGameName, setNewGameName, addFinalGame }: {
  games: FinalGame[]; players: string[]
  setFinalGameWinner: (i: number, w: string) => void; setFinalGamePoints: (i: number, p: string, v: string) => void
  getFinalWinner: (games: { winner: string }[], players: string[]) => string | null
  newGameName: string; setNewGameName: (v: string) => void; addFinalGame: (name: string) => void
}) {
  const wins = Object.fromEntries(players.map(p => [p, 0]))
  games.forEach(g => { if (g.winner) wins[g.winner] = (wins[g.winner] ?? 0) + 1 })
  const champion = players.find(p => wins[p] >= 2)
  return (
    <div className={styles.finalGamesSection}>
      {games.map((g, i) => (
        <div key={i} className={styles.finalGame}>
          <div className={styles.finalGameTop}><span className={styles.finalGameNum}>Игра {i + 1}</span>{g.name && <span className={styles.finalGameName}>"{g.name}"</span>}</div>
          <div className={styles.finalGamePoints}>
            {players.map(p => (<div key={p} className={styles.finalPointRow}><span className={styles.finalPointName}>{p}</span><input className={styles.pointsInput} type="number" min={0} placeholder="0" value={g.points?.[p] ?? ''} onChange={e => setFinalGamePoints(i, p, e.target.value)} /></div>))}
          </div>
          <div className={styles.finalGameBtns}>
            <span className={styles.finalGameWinnerLabel}>Победитель:</span>
            {players.map(p => (<button key={p} className={`${styles.finalPlayerBtn} ${g.winner === p ? styles.finalPlayerBtnWin : ''}`} onClick={() => setFinalGameWinner(i, g.winner === p ? '' : p)}>{p}</button>))}
          </div>
        </div>
      ))}
      {games.length > 0 && (
        <div className={styles.finalScore}>
          {players.map(p => <span key={p} className={`${styles.finalScoreItem} ${champion === p ? styles.finalChampion : ''}`}>{p}: {wins[p]}</span>)}
          {champion && <span className={styles.finalWinnerLabel}>🏆 Победитель: {champion}</span>}
        </div>
      )}
      {games.length < 3 && !getFinalWinner(games, players) && (
        <div className={styles.addGameRow}>
          <input className={styles.input} placeholder="Название игры (необязательно)" value={newGameName} onChange={e => setNewGameName(e.target.value)} />
          <button className={styles.btnNext} onClick={() => { addFinalGame(newGameName); setNewGameName('') }}>+ Игра {games.length + 1}</button>
        </div>
      )}
    </div>
  )
}

function InlineEditForm({ round, form, setForm, accent, initials, psigems, losers, winners, saving, mm, adjustPsi, setRole, toggleMMParticipant, getFinalWinner, addDM, removeDM, setDMName, toggleDMParticipant, setDMWinner, setDMEliminated, dmRoundsHelper, goToStep2, onSave, onCancel }: {
  round: Round; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>
  accent: string; initials: (n: string) => string; psigems: Record<string, number>
  losers: string[]; winners: string[]; saving: boolean
  mm: (fn: (l: MMGameForm[]) => MMGameForm[]) => void
  adjustPsi: (name: string, delta: number) => void; setRole: (name: string, role: MMRole) => void
  toggleMMParticipant: (name: string) => void
  getFinalWinner: (games: { winner: string }[], players: string[]) => string | null
  addDM: () => void; removeDM: (i: number) => void; setDMName: (di: number, v: string) => void
  toggleDMParticipant: (di: number, p: string) => void
  setDMWinner: (di: number, p: string) => void; setDMEliminated: (di: number, p: string) => void
  dmRoundsHelper: (di: number, fn: (l: MMGameForm[]) => MMGameForm[]) => void
  goToStep2: () => void; onSave: () => void; onCancel: () => void
}) {
  const isFinal = round.type === 'final'
  const finalPlayers = form.mmParticipants.length > 0 ? form.mmParticipants : []
  const [newGameName, setNewGameName] = useState('')
  const canSave = isFinal
    ? !!getFinalWinner(form.finalGames, finalPlayers) && form.finalGames.length >= 2
    : form.deathMatches.length === 0 || form.deathMatches.every(dm => dm.participants.length >= 2 && dm.winner && dm.eliminated && dm.winner !== dm.eliminated && dm.participants.includes(dm.winner) && dm.participants.includes(dm.eliminated))

  if (isFinal) return (
    <div className={styles.formCard} style={{ borderColor: 'rgba(176,38,255,0.3)' }}>
      <div className={styles.formHeader}><span className={styles.formTitle}>Редактировать Финал</span></div>
      <div className={styles.formBody}>
        <FinalGamesForm games={form.finalGames} players={finalPlayers}
          setFinalGameWinner={(i, w) => setForm(f => { const g = [...f.finalGames]; g[i] = { ...g[i], winner: w }; return { ...f, finalGames: g } })}
          setFinalGamePoints={(i, p, v) => setForm(f => { const g = [...f.finalGames]; g[i] = { ...g[i], points: { ...(g[i].points ?? {}), [p]: parseInt(v) || 0 } }; return { ...f, finalGames: g } })}
          getFinalWinner={getFinalWinner} newGameName={newGameName} setNewGameName={setNewGameName}
          addFinalGame={name => setForm(f => ({ ...f, finalGames: [...f.finalGames, { name, winner: '', points: {}, columnName: f.finalColumnName }] }))} />
        <div className={styles.formActions}><button className={styles.btnCancel} onClick={onCancel}>Отмена</button><button className={styles.btnSave} disabled={!canSave || saving} onClick={onSave}>{saving ? '...' : 'Сохранить изменения'}</button></div>
      </div>
    </div>
  )

  return (
    <RegularRoundForm form={form} setForm={setForm} accent={accent} initials={initials} psigems={psigems}
      availableParticipants={round.mainMatch.participants} losers={losers} winners={winners}
      saving={saving} mm={mm} adjustPsi={adjustPsi} setRole={setRole} toggleMMParticipant={toggleMMParticipant}
      canGoStep2={() => form.mmParticipants.length > 0 && losers.length > 0 && winners.length > 0}
      canSaveRegular={() => canSave}
      goToStep2={goToStep2} addDM={addDM} removeDM={removeDM} setDMName={setDMName}
      toggleDMParticipant={toggleDMParticipant} setDMWinner={setDMWinner} setDMEliminated={setDMEliminated} dmRoundsHelper={dmRoundsHelper}
      onSave={onSave} onCancel={onCancel} />
  )
}

function GameRoundsForm({ games, players, accent, initials, stripeColor, onAdd, onRemove, onUpdateName, onToggleCollapse, onAddColumn, onRemoveColumn, onUpdateColumnName, onSetPoints }: {
  games: MMGameForm[]; players: string[]; accent: string; initials: (n: string) => string; stripeColor: string
  onAdd: () => void; onRemove: (i: number) => void; onUpdateName: (i: number, v: string) => void; onToggleCollapse: (i: number) => void
  onAddColumn: (gi: number) => void; onRemoveColumn: (gi: number, ci: number) => void; onUpdateColumnName: (gi: number, ci: number, v: string) => void
  onSetPoints: (gi: number, ci: number, p: string, v: string) => void
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
            {games.length > 1 && <button className={styles.removeGameBtn} onClick={() => onRemove(gi)}>✕</button>}
            {games.length === 1 && <button className={styles.removeGameBtn} onClick={() => onRemove(gi)}>✕</button>}
          </div>
          {!game.collapsed && <>
            <input className={styles.input} placeholder="Название раунда (необязательно)" value={game.name} onChange={e => onUpdateName(gi, e.target.value)} />
            {game.columns.map((col, ci) => (
              <div key={ci} className={styles.mmColumnBlock}>
                <div className={styles.mmColumnHeader}>
                  <input className={`${styles.input} ${styles.inputNarrow}`} placeholder="Название колонки" value={col.name} onChange={e => onUpdateColumnName(gi, ci, e.target.value)} />
                  {game.columns.length > 1 && <button className={styles.removeGameBtn} onClick={() => onRemoveColumn(gi, ci)}>✕</button>}
                </div>
                <div className={styles.roleGrid}>
                  <div className={styles.roleHead} style={{ gridTemplateColumns: '28px 1fr 90px' }}><span /><span /><span className={styles.roleHeadCell}>{col.name || 'Очки'}</span></div>
                  {players.map(p => (
                    <div key={p} className={`${styles.roleRow} ${styles.roleRowSimple}`}>
                      <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>{initials(p)}</span>
                      <span className={styles.roleName}>{p}</span>
                      <input className={styles.pointsInput} type="number" min={0} placeholder="0" value={col.points[p] ?? ''} onChange={e => onSetPoints(gi, ci, p, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button className={styles.btnOutlineSmall} onClick={() => onAddColumn(gi)}>+ Добавить колонку</button>
          </>}
        </div>
      ))}
      <button className={styles.btnOutline} onClick={onAdd}>+ Добавить раунд</button>
    </div>
  )
}

function RoundCard({ round, accent, isAdmin, initials, psigems, isLast, isCollapsed, onToggle, onDelete, onEdit }: {
  round: Round; accent: string; isAdmin: boolean; initials: (n: string) => string
  psigems: Record<string, number>; isLast: boolean; isCollapsed: boolean; onToggle: () => void; onDelete: () => void; onEdit?: () => void
}) {
  const mm = round.mainMatch
  const dms = round.deathMatches ?? (round.deathMatch ? [round.deathMatch] : [])
  const isFinal = round.type === 'final'
  const mmColName = mm.columnName || 'Очки'
  const [collapsedMM, setCollapsedMM] = useState<Set<number>>(new Set())
  const [collapsedDM, setCollapsedDM] = useState<Map<number, Set<number>>>(new Map())

  function toggleMM(i: number) { setCollapsedMM(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n }) }
  function toggleDMSub(di: number, i: number) {
    setCollapsedDM(p => {
      const n = new Map(p)
      const s = new Set(n.get(di) ?? [])
      s.has(i) ? s.delete(i) : s.add(i)
      n.set(di, s)
      return n
    })
  }
  function rowRole(p: string): 'winner' | 'loser' | 'none' {
    if (mm.winners.includes(p)) return 'winner'
    if (mm.losers.includes(p)) return 'loser'
    return 'none'
  }
  const mmRanked = mm.points && Object.keys(mm.points).length > 0 ? [...mm.participants].sort((a, b) => (mm.points![b] ?? 0) - (mm.points![a] ?? 0)) : mm.participants
  const finalWins: Record<string, number> = {}
  if (isFinal && round.finalGames) { for (const g of round.finalGames) { if (g.winner) finalWins[g.winner] = (finalWins[g.winner] ?? 0) + 1 } }

  return (
    <div className={`${styles.roundCard} ${isFinal ? styles.finalCard : ''}`}>
      <div className={styles.roundHeader} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div className={styles.roundHeaderLeft}>
          <span className={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
          <span className={styles.roundNum} style={isFinal ? { color: '#FFD700' } : {}}>{isFinal ? '🏆 ФИНАЛ' : `РАУНД ${round.number}`}</span>
        </div>
        <div className={styles.roundHeaderRight}>
          {isFinal && mm.winners[0] && <span className={styles.finalChampionHeader}>🥇 {mm.winners[0]}</span>}
          {isAdmin && onEdit && <button className={styles.editRound} onClick={e => { e.stopPropagation(); onEdit() }}>✎</button>}
          {isAdmin && isLast && <button className={styles.deleteRound} onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>}
        </div>
      </div>

      {!isCollapsed && <>
        {/* Final */}
        {isFinal && round.finalGames && (
          <div className={styles.matchSection}>
            <div className={styles.finalStripe} />
            <div className={styles.matchContent}>
              <div className={styles.finalGamesDisplay}>
                {round.finalGames.map((g, i) => {
                  const colName = g.columnName || 'Очки'
                  return (
                    <div key={i} className={styles.finalGameDisplay}>
                      <div className={styles.finalGameDisplayHeader}><span className={styles.finalGameDisplayNum}>Игра {i + 1}</span>{g.name && <span className={styles.matchName}>"{g.name}"</span>}</div>
                      {g.points && Object.keys(g.points).length > 0 && (
                        <div className={styles.rankTable} style={{ marginTop: 8 }}>
                          <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{colName}</span><span></span></div>
                          {mm.participants.sort((a, b) => (g.points![b] ?? 0) - (g.points![a] ?? 0)).map((p, ri) => (
                            <div key={p} className={`${styles.rankTableRow} ${g.winner === p ? styles.rowWinner : styles.rowNeutral}`}>
                              <span className={styles.rankTableNum}>{ri + 1}</span>
                              <span className={styles.rankTableName}><span className={styles.rankTableAvatar} style={g.winner === p ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : { background: `${accent}15`, color: accent }}>{initials(p)}</span>{p}{g.winner === p && <span className={styles.wingIcon}>🪶</span>}</span>
                              <span className={styles.rankTablePts}>{g.points![p] ?? '—'}</span><span />
                            </div>
                          ))}
                        </div>
                      )}
                      {(!g.points || !Object.keys(g.points).length) && <div className={styles.finalGameSimpleResult}><span style={{ color: '#22c55e' }}>🏆 {g.winner}</span></div>}
                    </div>
                  )
                })}
                <div className={styles.finalScoreDisplay}>
                  {mm.participants.map(p => <span key={p} className={`${styles.finalScoreDisplayItem} ${mm.winners[0] === p ? styles.champion : ''}`}>{p}: {finalWins[p] ?? 0} побед</span>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MM */}
        {!isFinal && (
          <div className={styles.matchSection}>
            <div className={styles.mmStripe} />
            <div className={styles.matchContent}>
              <div className={styles.matchTitleRow}>
                <span className={styles.matchType}>MAIN MATCH</span>
                {mm.name && <span className={styles.matchNameAccent}>{mm.name}</span>}
              </div>
              <SubRoundsDisplay games={mm.games} participants={mm.participants} accent={accent} initials={initials} psigems={psigems} rowRole={rowRole} collapsedSet={collapsedMM} onToggle={toggleMM} numColor="#4ADE80"
                fallback={
                  <div className={styles.rankTable}>
                    <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{mmColName}</span><span>Ψ</span></div>
                    {mmRanked.map((p, i) => { const role = rowRole(p); return (
                      <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`}>
                        <span className={styles.rankTableNum}>{i + 1}</span>
                        <span className={styles.rankTableName}><span className={styles.rankTableAvatar} style={role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' } : { background: `${accent}15`, color: accent }}>{initials(p)}</span>{p}{role === 'winner' && <span className={styles.wingIcon}>🪶</span>}</span>
                        <span className={styles.rankTablePts}>{mm.points?.[p] ?? '—'}</span>
                        <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                      </div>
                    )})}
                  </div>
                } />
            </div>
          </div>
        )}

        {/* Death Matches */}
        {!isFinal && dms.map((dm, di) => (
          <div key={di} className={styles.matchSection}>
            <div className={styles.dmStripe} />
            <div className={styles.matchContent}>
              <div className={styles.matchTitleRow}>
                <span className={styles.matchTypeDm}>DEATH MATCH {dms.length > 1 ? di + 1 : ''}</span>
                {dm.name && <span className={styles.matchNameAccent} style={{ color: '#EF4444' }}>{dm.name}</span>}
              </div>
              <SubRoundsDisplay
                games={dm.rounds} participants={dm.participants} accent={accent} initials={initials} psigems={psigems}
                rowRole={p => p === dm.winner ? 'winner' : p === dm.eliminated ? 'loser' : 'none'}
                collapsedSet={collapsedDM.get(di) ?? new Set()} onToggle={i => toggleDMSub(di, i)} numColor="#EF4444"
                fallback={
                  <div className={styles.rankTable}>
                    <div className={styles.rankTableHead}><span>#</span><span>Игрок</span><span>{dm.columnName || 'Очки'}</span><span>Ψ</span></div>
                    {[...dm.participants].sort((a, b) => dm.winner === a ? -1 : dm.winner === b ? 1 : 0).map((p, i) => {
                      const isWin = p === dm.winner; const isElim = p === dm.eliminated
                      return (
                        <div key={p} className={`${styles.rankTableRow} ${isWin ? styles.rowWinner : styles.rowLoser}`}>
                          <span className={styles.rankTableNum}>{i + 1}</span>
                          <span className={styles.rankTableName}><span className={styles.rankTableAvatar} style={isWin ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : { background: 'rgba(239,68,68,0.25)', color: '#ef4444' }}>{initials(p)}</span><span className={isElim ? styles.eliminated : ''}>{p}</span>{isWin && <span className={styles.wingIcon}>🪶</span>}</span>
                          <span className={styles.rankTablePts}>{dm.points?.[p] ?? '—'}</span>
                          <span className={styles.rankTablePsi}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                        </div>
                      )
                    })}
                  </div>
                } />
            </div>
          </div>
        ))}
      </>}
    </div>
  )
}

function SubRoundsDisplay({ games, participants, accent, initials, psigems, rowRole, collapsedSet, onToggle, numColor, fallback }: {
  games?: { name: string; columns?: { name: string; points?: Record<string, number> }[] }[]
  participants: string[]; accent: string; initials: (n: string) => string; psigems: Record<string, number>
  rowRole: (p: string) => 'winner' | 'loser' | 'none'; collapsedSet: Set<number>; onToggle: (i: number) => void
  numColor: string; fallback: React.ReactNode
}) {
  if (!games || games.length === 0) return <>{fallback}</>
  return (
    <div className={styles.mmGamesDisplay}>
      {games.map((game, gi) => {
        const isCollapsed = collapsedSet.has(gi)
        const cols = game.columns && game.columns.length > 0 ? game.columns : []
        const nCols = cols.length
        const gridTemplate = `28px minmax(80px, 2fr) ${Array(nCols).fill('minmax(80px, 1fr)').join(' ')} 55px`
        const ranked = nCols > 0 && cols.some(c => c.points && Object.keys(c.points).length > 0)
          ? [...participants].sort((a, b) => cols.reduce((s, c) => s + (c.points?.[b] ?? 0) - (c.points?.[a] ?? 0), 0))
          : participants
        return (
          <div key={gi} className={styles.mmGameDisplayBlock}>
            <div className={styles.mmGameDisplayHeader} onClick={() => onToggle(gi)} style={{ cursor: 'pointer' }}>
              <span className={styles.mmSubRoundCollapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
              <span className={styles.mmGameDisplayNum} style={{ color: numColor }}>Раунд {gi + 1}</span>
              {game.name && <span className={styles.mmSubRoundNameDisplay}>{game.name}</span>}
            </div>
            {!isCollapsed && nCols > 0 && (
              <div className={styles.rankTable}>
                <div className={styles.rankTableHead} style={{ gridTemplateColumns: gridTemplate }}>
                  <span>#</span><span>Игрок</span>
                  {cols.map((c, ci) => <span key={ci} title={c.name} style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'center', fontSize: '0.7rem', whiteSpace: 'normal', lineHeight: '1.3', fontWeight: 600 }}>{c.name || 'Очки'}</span>)}
                  <span style={{ textAlign: 'center' }}>Ψ</span>
                </div>
                {ranked.map((p, ri) => { const role = rowRole(p); return (
                  <div key={p} className={`${styles.rankTableRow} ${role === 'winner' ? styles.rowWinner : role === 'loser' ? styles.rowLoser : styles.rowNeutral}`} style={{ gridTemplateColumns: gridTemplate }}>
                    <span className={styles.rankTableNum}>{ri + 1}</span>
                    <span className={styles.rankTableName}><span className={styles.rankTableAvatar} style={role === 'winner' ? { background: 'rgba(34,197,94,0.25)', color: '#22c55e' } : role === 'loser' ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444' } : { background: `${accent}15`, color: accent }}>{initials(p)}</span>{p}{role === 'winner' && <span className={styles.wingIcon}>🪶</span>}</span>
                    {cols.map((c, ci) => <span key={ci} className={styles.rankTablePts} style={{ textAlign: 'center' }}>{c.points?.[p] ?? '—'}</span>)}
                    <span className={styles.rankTablePsi} style={{ textAlign: 'center' }}>{psigems[p] ?? 1}<span className={styles.psiUnit}> Ψ</span></span>
                  </div>
                )})}
              </div>
            )}
            {!isCollapsed && nCols === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '4px 0' }}>Нет данных</p>}
          </div>
        )
      })}
    </div>
  )
}
