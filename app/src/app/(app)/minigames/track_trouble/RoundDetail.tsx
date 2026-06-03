'use client'

import { useState } from 'react'
import type { MinecartRound, MinigameData, RoundLayout } from '@/lib/minigames'
import type { Role } from '@/lib/types'
import VisualLayoutViewer from './VisualLayoutViewer'
import VisualLayoutEditor from './VisualLayoutEditor'
import SubmissionForm from './SubmissionForm'
import SubmissionsPanel from './SubmissionsPanel'
import ResultPanel from './ResultPanel'
import styles from './minigame.module.css'

interface Props {
  game: MinigameData
  round: MinecartRound
  role: Role
  username: string
  onUpdate: (g: MinigameData) => void
}

export default function RoundDetail({ game, round, role, username, onUpdate }: Props) {
  const [editingLayout, setEditingLayout] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState('')
  const [peeking, setPeeking] = useState(false)
  const [peekData, setPeekData] = useState<RoundLayout | null>(null)
  const [peekError, setPeekError] = useState('')

  const isAdmin = role === 'admin'
  const crossingNumber: 1 | 2 = round.phase === 'crossing2_open' ? 2 : 1

  // player's current side
  function getPlayerSide(): 'north' | 'south' {
    if (crossingNumber === 1) return 'south'
    const c1 = round.results.find(r => r.crossingNumber === 1)
    return c1?.playerPositions[username] ?? 'south'
  }

  const playerSide = getPlayerSide()
  const isOpen = round.phase === 'crossing1_open' || round.phase === 'crossing2_open'
  const isPending = round.phase === 'pending'
  const isDone = round.phase === 'complete'

  const canPeek = isPending
    && round.layout.peekUnlocked
    && !isAdmin
    && !(game.peeks[username] ?? []).includes(round.roundNumber)

  async function handlePeek() {
    setPeeking(true)
    setPeekError('')
    const res = await fetch(`/api/minigames/${game.id}/rounds/${round.roundNumber}/peek`, { method: 'POST' })
    setPeeking(false)
    if (res.ok) {
      const d = await res.json()
      setPeekData(d.layout)
    } else {
      const d = await res.json()
      setPeekError(d.error ?? 'Ошибка')
    }
  }

  async function refreshGame() {
    const res = await fetch(`/api/minigames/${game.id}`)
    if (res.ok) onUpdate(await res.json())
  }

  async function seedDefaults() {
    setSeeding(true)
    setSeedError('')
    const res = await fetch(`/api/minigames/${game.id}/seed`, { method: 'POST' })
    setSeeding(false)
    if (res.ok) {
      refreshGame()
    } else {
      const d = await res.json().catch(() => ({}))
      setSeedError(d.error ?? `HTTP ${res.status}`)
    }
  }

  const layoutToShow = peekData ?? (isOpen || isDone ? round.layout : null)

  return (
    <div className={styles.roundDetail}>
      {/* Phase badge */}
      <div className={styles.roundPhaseRow}>
        <span className={`${styles.phaseBadge} ${styles[`phase_${round.phase}`]}`}>
          {round.phase === 'pending' && 'Ожидание'}
          {round.phase === 'crossing1_open' && '🔴 Пересечение 1 открыто'}
          {round.phase === 'crossing2_open' && '🔴 Пересечение 2 открыто'}
          {round.phase === 'complete' && '✅ Завершён'}
        </span>
        {round.phaseDeadline && isOpen && (
          <span className={styles.deadlineTag}>
            до {new Date(round.phaseDeadline).toLocaleString('ru-RU')}
          </span>
        )}
      </div>

      {/* Admin: layout editor toggle */}
      {isAdmin && (
        <div className={styles.adminToolbar}>
          <button className={styles.editorToggleBtn} onClick={() => setEditingLayout(v => !v)}>
            {editingLayout ? '← Просмотр' : '✏️ Редактировать макет'}
          </button>
          <button className={styles.editorToggleBtn} onClick={seedDefaults} disabled={seeding}>
            {seeding ? 'Загрузка...' : '📥 Загрузить эталонные макеты'}
          </button>
          {seedError && <span className={styles.subError}>Ошибка: {seedError}</span>}
        </div>
      )}

      {/* Layout editor (admin) */}
      {isAdmin && editingLayout && (
        <VisualLayoutEditor
          gameSlug={game.id}
          roundNumber={round.roundNumber}
          initialLayout={round.layout}
          onSaved={(l) => {
            setEditingLayout(false)
            refreshGame()
            void l
          }}
        />
      )}

      {/* Layout viewer */}
      {!editingLayout && layoutToShow && (
        <VisualLayoutViewer
          layout={layoutToShow}
          playerSide={playerSide}
          availableChains={crossingNumber === 2 ? round.availableChainsForCrossing2 : undefined}
          crossingNumber={crossingNumber}
        />
      )}

      {/* Peek button (players only, pending rounds) */}
      {canPeek && !peekData && (
        <div className={styles.peekSection}>
          <button className={styles.peekBtn} onClick={handlePeek} disabled={peeking}>
            {peeking ? 'Открываю...' : '👁 Посмотреть макет (2 Ψ)'}
          </button>
          {peekError && <span className={styles.subError}>{peekError}</span>}
        </div>
      )}

      {/* Results */}
      {round.results.map(r => (
        <ResultPanel key={r.crossingNumber} result={r} round={round} />
      ))}

      {/* Submission form (players, open crossing) */}
      {!isAdmin && isOpen && (
        <SubmissionForm
          gameSlug={game.id}
          round={round}
          username={username}
          playerSide={playerSide}
          crossingNumber={crossingNumber}
          onSubmitted={refreshGame}
        />
      )}

      {/* Admin submissions panel */}
      {isAdmin && (
        <SubmissionsPanel
          gameSlug={game.id}
          round={round}
          onResolved={refreshGame}
        />
      )}
    </div>
  )
}
