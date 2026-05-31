'use client'

import { useState } from 'react'
import type { Round, MainMatch, DeathMatch } from '@/lib/seasons'
import styles from './rounds.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  initialRounds: Round[]
  participants: string[]
}

type MMRole = 'winner' | 'loser' | 'none'

interface FormState {
  mmName: string
  mmParticipants: string[]
  mmRoles: Record<string, MMRole>
  dmName: string
  dmWinner: string
  dmEliminated: string
  step: 1 | 2
}

const INIT_FORM: FormState = {
  mmName: '',
  mmParticipants: [],
  mmRoles: {},
  dmName: '',
  dmWinner: '',
  dmEliminated: '',
  step: 1,
}

export default function RoundsSection({ slug, accent, isAdmin, initialRounds, participants }: Props) {
  const [rounds, setRounds] = useState<Round[]>(initialRounds)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(INIT_FORM)
  const [saving, setSaving] = useState(false)

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  const losers = form.mmParticipants.filter(p => form.mmRoles[p] === 'loser')
  const winners = form.mmParticipants.filter(p => form.mmRoles[p] === 'winner')

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

  function canGoStep2() {
    return form.mmName.trim() && form.mmParticipants.length > 0 && losers.length > 0 && winners.length > 0
  }

  function canSave() {
    return form.dmName.trim() && form.dmWinner && form.dmEliminated && form.dmWinner !== form.dmEliminated
  }

  async function handleSave() {
    if (!canSave()) return
    setSaving(true)
    const mm: MainMatch = {
      name: form.mmName,
      participants: form.mmParticipants,
      winners,
      losers,
    }
    const dm: DeathMatch = {
      name: form.dmName,
      participants: losers,
      winner: form.dmWinner,
      eliminated: form.dmEliminated,
    }
    const res = await fetch(`/api/seasons/${slug}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainMatch: mm, deathMatch: dm }),
    })
    if (res.ok) {
      const newRound = await res.json()
      setRounds(prev => [...prev, newRound])
    }
    setSaving(false)
    setShowForm(false)
    setForm(INIT_FORM)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/seasons/${slug}/rounds/${id}`, { method: 'DELETE' })
    setRounds(prev => prev.filter(r => r.id !== id).map((r, i) => ({ ...r, number: i + 1 })))
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>РАУНДЫ</span>
        {isAdmin && !showForm && (
          <button className={styles.btnOutline} onClick={() => setShowForm(true)}>
            + Добавить раунд
          </button>
        )}
      </div>

      {/* Round cards */}
      {rounds.length === 0 && !showForm && (
        <p className={styles.empty}>Раунды ещё не добавлены</p>
      )}

      <div className={styles.roundsList}>
        {rounds.map(round => (
          <RoundCard
            key={round.id}
            round={round}
            accent={accent}
            isAdmin={isAdmin}
            initials={initials}
            onDelete={() => handleDelete(round.id)}
          />
        ))}
      </div>

      {/* Add round form */}
      {showForm && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <span className={styles.formTitle}>Раунд {rounds.length + 1}</span>
            <div className={styles.steps}>
              <span className={`${styles.step} ${form.step === 1 ? styles.stepActive : styles.stepDone}`}>
                1 Main Match
              </span>
              <span className={styles.stepArrow}>→</span>
              <span className={`${styles.step} ${form.step === 2 ? styles.stepActive : ''}`}>
                2 Death Match
              </span>
            </div>
          </div>

          {form.step === 1 && (
            <div className={styles.formBody}>
              <div className={styles.mmHeader}>
                <div className={styles.mmBar} />
                <span className={styles.matchLabel}>MAIN MATCH</span>
              </div>
              <input
                className={styles.input}
                placeholder="Название игры"
                value={form.mmName}
                onChange={e => setForm(f => ({ ...f, mmName: e.target.value }))}
              />
              <p className={styles.hint}>Выбери участников:</p>
              <div className={styles.chipGrid}>
                {participants.map(p => (
                  <button
                    key={p}
                    className={`${styles.chip} ${form.mmParticipants.includes(p) ? styles.chipSelected : ''}`}
                    onClick={() => toggleMMParticipant(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {form.mmParticipants.length > 0 && (
                <>
                  <p className={styles.hint}>Отметь роли:</p>
                  <div className={styles.roleGrid}>
                    {form.mmParticipants.map(p => (
                      <div key={p} className={styles.roleRow}>
                        <span className={styles.roleAvatar} style={{ background: `${accent}22`, color: accent }}>
                          {initials(p)}
                        </span>
                        <span className={styles.roleName}>{p}</span>
                        <div className={styles.roleBtns}>
                          <button
                            className={`${styles.roleBtn} ${form.mmRoles[p] === 'winner' ? styles.roleBtnWin : ''}`}
                            onClick={() => setRole(p, form.mmRoles[p] === 'winner' ? 'none' : 'winner')}
                          >🏆</button>
                          <button
                            className={`${styles.roleBtn} ${form.mmRoles[p] === 'loser' ? styles.roleBtnLose : ''}`}
                            onClick={() => setRole(p, form.mmRoles[p] === 'loser' ? 'none' : 'loser')}
                          >⚔️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className={styles.formActions}>
                <button className={styles.btnCancel} onClick={() => { setShowForm(false); setForm(INIT_FORM) }}>
                  Отмена
                </button>
                <button
                  className={styles.btnNext}
                  disabled={!canGoStep2()}
                  onClick={() => setForm(f => ({ ...f, step: 2 }))}
                >
                  Далее →
                </button>
              </div>
            </div>
          )}

          {form.step === 2 && (
            <div className={styles.formBody}>
              <div className={styles.dmHeader}>
                <div className={styles.dmBar} />
                <span className={styles.matchLabel}>DEATH MATCH</span>
              </div>
              <input
                className={styles.input}
                placeholder="Название игры"
                value={form.dmName}
                onChange={e => setForm(f => ({ ...f, dmName: e.target.value }))}
              />
              <p className={styles.hint}>Участники (из проигравших в Main Match):</p>
              <div className={styles.dmVs}>
                {losers.map(p => (
                  <div key={p} className={styles.dmPlayer}>
                    <span className={styles.dmAvatar}>{initials(p)}</span>
                    <span className={styles.dmName}>{p}</span>
                    <div className={styles.dmChoices}>
                      <button
                        className={`${styles.dmChoice} ${form.dmWinner === p ? styles.dmChoiceWin : ''}`}
                        onClick={() => setForm(f => ({ ...f, dmWinner: p, dmEliminated: f.dmEliminated === p ? '' : f.dmEliminated }))}
                      >✓ Выжил</button>
                      <button
                        className={`${styles.dmChoice} ${form.dmEliminated === p ? styles.dmChoiceLose : ''}`}
                        onClick={() => setForm(f => ({ ...f, dmEliminated: p, dmWinner: f.dmWinner === p ? '' : f.dmWinner }))}
                      >✗ Вылетел</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.formActions}>
                <button className={styles.btnCancel} onClick={() => setForm(f => ({ ...f, step: 1 }))}>
                  ← Назад
                </button>
                <button
                  className={styles.btnSave}
                  disabled={!canSave() || saving}
                  onClick={handleSave}
                >
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

function RoundCard({ round, accent, isAdmin, initials, onDelete }: {
  round: Round
  accent: string
  isAdmin: boolean
  initials: (n: string) => string
  onDelete: () => void
}) {
  const mm = round.mainMatch
  const dm = round.deathMatch
  const totalBefore = mm.participants.length + (dm ? 1 : 0)
  const totalAfter = dm ? totalBefore - 1 : totalBefore

  function avatarStyle(name: string) {
    if (mm.winners.includes(name)) return { bg: 'rgba(74,222,128,0.18)', color: '#4ADE80', border: 'rgba(74,222,128,0.5)' }
    if (mm.losers.includes(name)) return { bg: 'rgba(249,115,22,0.18)', color: '#F97316', border: 'rgba(249,115,22,0.5)' }
    return { bg: `${accent}18`, color: accent, border: `${accent}45` }
  }

  return (
    <div className={styles.roundCard}>
      {isAdmin && (
        <button className={styles.deleteRound} onClick={onDelete}>✕</button>
      )}

      <div className={styles.roundHeader}>
        <span className={styles.roundNum}>РАУНД {round.number}</span>
        <span className={styles.roundCount}>{totalBefore} → {totalAfter} игр.</span>
      </div>

      {/* Main Match */}
      <div className={styles.matchSection}>
        <div className={styles.mmStripe} />
        <div className={styles.matchContent}>
          <div className={styles.matchTitleRow}>
            <span className={styles.matchType}>MAIN MATCH</span>
            <span className={styles.matchName}>"{mm.name}"</span>
          </div>

          <div className={styles.avatarRow}>
            {mm.participants.map(p => {
              const s = avatarStyle(p)
              const icon = mm.winners.includes(p) ? '🏆' : mm.losers.includes(p) ? '⚔️' : null
              return (
                <div key={p} className={styles.avatarWrap}>
                  <div className={styles.mmAvatar} style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                    {icon && <span className={styles.avatarIcon}>{icon}</span>}
                    {initials(p)}
                  </div>
                  <span className={styles.avatarName}>{p}</span>
                </div>
              )
            })}
          </div>

          <div className={styles.mmSummary}>
            <span className={styles.summaryWin}>🏆 {mm.winners.join(', ')}</span>
            <span className={styles.summaryLose}>⚔️ → Death Match: {mm.losers.join(', ')}</span>
          </div>
        </div>
      </div>

      {/* Death Match */}
      {dm && (
        <div className={styles.matchSection}>
          <div className={styles.dmStripe} />
          <div className={styles.matchContent}>
            <div className={styles.matchTitleRow}>
              <span className={styles.matchTypeDm}>DEATH MATCH</span>
              <span className={styles.matchName}>"{dm.name}"</span>
            </div>

            <div className={styles.vsRow}>
              {dm.participants.map((p, i) => {
                const isWinner = p === dm.winner
                const isElim = p === dm.eliminated
                return (
                  <div key={p} className={styles.vsGroup}>
                    {i > 0 && <span className={styles.vsText}>VS</span>}
                    <div className={`${styles.vsPlayer} ${isWinner ? styles.vsWinner : ''} ${isElim ? styles.vsElim : ''}`}>
                      <div className={styles.vsAvatar} style={
                        isWinner
                          ? { background: 'rgba(74,222,128,0.18)', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.5)' }
                          : { background: 'rgba(239,68,68,0.18)', color: '#EF4444', borderColor: 'rgba(239,68,68,0.5)' }
                      }>
                        {initials(p)}
                      </div>
                      <span className={`${styles.vsName} ${isElim ? styles.vsNameElim : ''}`}>{p}</span>
                      <span className={isWinner ? styles.vsResult : styles.vsResultLose}>
                        {isWinner ? '✓ выжил' : '✗ вылетел'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
