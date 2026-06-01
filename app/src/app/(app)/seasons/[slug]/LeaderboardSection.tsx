'use client'

import { useState, useEffect } from 'react'
import type { Round } from '@/lib/seasons'
import styles from './season.module.css'

interface Props {
  slug: string
  accent: string
  isAdmin: boolean
  participants: string[]
  initialPsigems: Record<string, number>
  initialRounds: Round[]
}

export default function LeaderboardSection({ slug, accent, isAdmin, participants, initialPsigems, initialRounds }: Props) {
  const [psigems, setPsigems] = useState<Record<string, number>>(initialPsigems)
  const [rounds, setRounds] = useState<Round[]>(initialRounds)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>(initialPsigems)
  const [saving, setSaving] = useState(false)

  // Polling every 8s, paused when tab is hidden or editing
  useEffect(() => {
    if (editing) return
    const interval = setInterval(async () => {
      if (document.hidden) return
      const [psiRes, rndRes] = await Promise.all([
        fetch(`/api/seasons/${slug}/psigems`),
        fetch(`/api/seasons/${slug}/rounds`),
      ])
      if (psiRes.ok) setPsigems(await psiRes.json())
      if (rndRes.ok) setRounds(await rndRes.json())
    }, 8000)
    return () => clearInterval(interval)
  }, [slug, editing])

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  // Groups of eliminated players per round (same round = same rank)
  const eliminatedGroups: string[][] = rounds
    .map(r => {
      const dms = r.deathMatches ?? (r.deathMatch ? [r.deathMatch] : [])
      return dms.map(dm => dm.eliminated).filter(Boolean) as string[]
    })
    .filter(g => g.length > 0)

  const finalRound = rounds.find(r => r.type === 'final')
  const champion = finalRound?.mainMatch.winners[0] ?? null
  const runnerUp = finalRound?.mainMatch.losers[0] ?? null

  const eliminatedSet = new Set(eliminatedGroups.flat())
  const active = participants.filter(p => !eliminatedSet.has(p))
  const activeSorted = finalRound
    ? [
        ...(champion ? [champion] : []),
        ...(runnerUp ? [runnerUp] : []),
        ...active.filter(p => p !== champion && p !== runnerUp).sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1)),
      ]
    : [...active].sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))
  // Reverse: most recently eliminated group shown highest among eliminated
  const eliminatedGroupsReversed = [...eliminatedGroups].reverse()
  const sorted = [...activeSorted, ...eliminatedGroupsReversed.flat()]

  const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32']

  // Group active players by psigem value for tie detection
  function buildPsiGroups(players: string[]): string[][] {
    const map = new Map<number, string[]>()
    const groups: string[][] = []
    for (const p of players) {
      const psi = psigems[p] ?? 1
      if (!map.has(psi)) { map.set(psi, []); groups.push(map.get(psi)!) }
      map.get(psi)!.push(p)
    }
    return groups
  }

  const activeGroups: string[][] = finalRound
    ? [
        ...(champion ? [[champion]] : []),
        ...(runnerUp ? [[runnerUp]] : []),
        ...buildPsiGroups(active.filter(p => p !== champion && p !== runnerUp).sort((a, b) => (psigems[b] ?? 1) - (psigems[a] ?? 1))),
      ]
    : buildPsiGroups(activeSorted)

  function getRank(name: string): number {
    if (!eliminatedSet.has(name)) {
      let rank = 1
      for (const group of activeGroups) {
        if (group.includes(name)) return rank
        rank += group.length
      }
      return rank
    }
    let rank = activeSorted.length + 1
    for (const group of eliminatedGroupsReversed) {
      if (group.includes(name)) return rank
      rank += group.length
    }
    return rank
  }

  function getRankDisplay(name: string): string {
    if (!eliminatedSet.has(name)) {
      let rank = 1
      for (const group of activeGroups) {
        if (group.includes(name)) {
          return group.length === 1 ? String(rank) : `${rank}–${rank + group.length - 1}`
        }
        rank += group.length
      }
      return String(rank)
    }
    let rank = activeSorted.length + 1
    for (const group of eliminatedGroupsReversed) {
      if (group.includes(name)) {
        if (group.length === 1) return String(rank)
        return `${rank}–${rank + group.length - 1}`
      }
      rank += group.length
    }
    return String(rank)
  }

  function startEdit() { setDraft({ ...psigems }); setEditing(true) }
  function adjust(name: string, delta: number) {
    setDraft(prev => ({ ...prev, [name]: Math.max(0, (prev[name] ?? 1) + delta) }))
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/seasons/${slug}/psigems`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) setPsigems(await res.json())
    setSaving(false)
    setEditing(false)
  }

  if (participants.length === 0) return null

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ЛИДЕРБОРД</span>
        {isAdmin && !editing && (
          <button className={styles.btnOutline} onClick={startEdit}>Ψ Редактировать</button>
        )}
        {isAdmin && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnAccent} onClick={handleSave} disabled={saving}>
              {saving ? '...' : 'Сохранить'}
            </button>
            <button className={styles.btnOutline} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        )}
      </div>

      <div className={styles.rankList}>
        {(editing ? participants : sorted).map((name, i) => {
          const val = editing ? (draft[name] ?? 1) : (psigems[name] ?? 1)
          const rank = editing ? null : getRank(name)
          const color = editing ? accent : (rank === 1 ? MEDALS[0] : rank === 2 ? MEDALS[1] : rank === 3 ? MEDALS[2] : accent)
          return (
            <div
              key={name}
              className={`${styles.rankRow} ${!editing && rank === 1 ? styles.rankRow1 : !editing && rank === 2 ? styles.rankRow2 : !editing && rank === 3 ? styles.rankRow3 : ''}`}
            >
              <span className={`${styles.rankNum} ${!editing && rank === 1 ? styles.rankNum1 : ''}`} style={{ color }}>
                {editing ? '–' : getRankDisplay(name)}
              </span>
              <span
                className={`${styles.rankAvatar} ${!editing && rank === 1 ? styles.rankAvatar1 : ''}`}
                style={{ background: `${color}18`, color, borderColor: `${color}45` }}
              >
                {initials(name)}
              </span>
              <span className={`${styles.rankName} ${!editing && rank === 1 ? styles.rankName1 : ''}`}>{name}</span>

              {editing ? (
                <div className={styles.psiControls}>
                  <button className={styles.psiBtn} onClick={() => adjust(name, -1)}>−</button>
                  <span className={styles.psiVal}>{draft[name] ?? 1}</span>
                  <button className={styles.psiBtn} onClick={() => adjust(name, 1)}>+</button>
                  <span className={styles.psiUnit}>Ψ</span>
                </div>
              ) : (
                <span className={styles.psiDisplay}>
                  {val}<span className={styles.psiUnit}> Ψ</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
