'use client'

import { useState, useEffect } from 'react'
import type { MinecartRound } from '@/lib/minigames'
import styles from './minigame.module.css'

interface SubmissionsData {
  submissions: Array<{ username: string; action: { type: string; chainId?: string; switchId?: string }; submittedAt: string }>
  submitted: string[]
  pending: string[]
  phase: string
  deadline: string | null
}

interface Props {
  gameSlug: string
  round: MinecartRound
  onResolved: () => void
}

export default function SubmissionsPanel({ gameSlug, round, onResolved }: Props) {
  const [data, setData] = useState<SubmissionsData | null>(null)
  const [resolving, setResolving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${round.roundNumber}/submissions`)
    if (res.ok) setData(await res.json())
  }

  useEffect(() => {
    if (round.phase === 'crossing1_open' || round.phase === 'crossing2_open') {
      load()
      const id = setInterval(load, 5000)
      return () => clearInterval(id)
    }
  }, [round.phase, round.roundNumber, gameSlug])

  async function resolve() {
    setResolving(true)
    setError('')
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${round.roundNumber}/resolve`, { method: 'POST' })
    setResolving(false)
    if (res.ok) onResolved()
    else {
      const d = await res.json()
      setError(d.error ?? 'Ошибка')
    }
  }

  async function openCrossing() {
    setOpening(true)
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${round.roundNumber}/open`, { method: 'POST' })
    setOpening(false)
    if (res.ok) onResolved()
    else {
      const d = await res.json()
      setError(d.error ?? 'Ошибка')
    }
  }

  const canOpen = round.phase === 'pending'
  const isOpen = round.phase === 'crossing1_open' || round.phase === 'crossing2_open'

  const allSubmitted = data ? data.pending.length === 0 : false
  const deadlinePassed = round.phaseDeadline ? new Date() > new Date(round.phaseDeadline) : false
  const canResolve = isOpen && (allSubmitted || deadlinePassed)

  function actionLabel(action: { type: string; chainId?: string; switchId?: string }) {
    if (action.type === 'board') return `🚃 ${action.chainId}`
    if (action.type === 'switch') return `⚡ ${action.switchId}`
    return '⏸ Остаться'
  }

  return (
    <div className={styles.subPanel}>
      {round.phase === 'pending' && (
        <button className={styles.openBtn} onClick={openCrossing} disabled={opening}>
          {opening ? 'Открываю...' : round.results.length === 0 ? '▶ Открыть Пересечение 1' : '▶ Открыть Пересечение 2'}
        </button>
      )}

      {isOpen && data && (
        <>
          <div className={styles.subPanelStats}>
            <span className={styles.subStatGreen}>✓ Подали: {data.submitted.length}</span>
            <span className={styles.subStatPending}>⏳ Ожидают: {data.pending.length}</span>
            {round.phaseDeadline && (
              <span className={styles.subDeadline}>
                Дедлайн: {new Date(round.phaseDeadline).toLocaleString('ru-RU')}
              </span>
            )}
          </div>

          {data.pending.length > 0 && (
            <div className={styles.pendingList}>
              {data.pending.map(p => <span key={p} className={styles.pendingTag}>{p}</span>)}
            </div>
          )}

          <div className={styles.subList}>
            {data.submissions.map(s => (
              <div key={s.username} className={styles.subItem}>
                <span className={styles.subItemUser}>{s.username}</span>
                <span className={styles.subItemAction}>{actionLabel(s.action)}</span>
                <span className={styles.subItemTime}>{new Date(s.submittedAt).toLocaleTimeString('ru-RU')}</span>
              </div>
            ))}
          </div>

          <button className={styles.resolveBtn} onClick={resolve} disabled={resolving || !canResolve}>
            {resolving ? 'Разрешаю...' : canResolve ? '⚡ Разрешить пересечение' : `Ожидание (${data.pending.length} не подали)`}
          </button>
        </>
      )}

      {error && <div className={styles.subError}>{error}</div>}
    </div>
  )
}
