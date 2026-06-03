'use client'

import { useState } from 'react'
import type { MinigameData } from '@/lib/minigames'
import type { Role } from '@/lib/types'
import RoundDetail from './RoundDetail'
import styles from './minigame.module.css'

interface Props {
  game: MinigameData
  role: Role
  username: string
  onUpdate: (g: MinigameData) => void
}

export default function RoundsSection({ game, role, username, onUpdate }: Props) {
  const activeRoundIdx = game.rounds.findIndex(r => r.phase === 'crossing1_open' || r.phase === 'crossing2_open')
  const [selectedRound, setSelectedRound] = useState(activeRoundIdx >= 0 ? activeRoundIdx : 0)

  const round = game.rounds[selectedRound]

  const PHASE_SHORT: Record<string, string> = {
    pending: '–',
    crossing1_open: 'C1',
    crossing2_open: 'C2',
    complete: '✓',
  }

  return (
    <div className={styles.roundsWrap}>
      {/* Round selector */}
      <div className={styles.roundPicker}>
        {game.rounds.map((r, i) => (
          <button
            key={r.roundNumber}
            className={`${styles.roundTab} ${i === selectedRound ? styles.roundTabActive : ''} ${r.phase === 'complete' ? styles.roundTabDone : ''} ${(r.phase === 'crossing1_open' || r.phase === 'crossing2_open') ? styles.roundTabLive : ''}`}
            onClick={() => setSelectedRound(i)}
          >
            <span>{r.roundNumber}</span>
            <span className={styles.roundTabPhase}>{PHASE_SHORT[r.phase]}</span>
          </button>
        ))}
      </div>

      {round && (
        <div className={styles.roundDetailWrap}>
          <div className={styles.roundDetailHeader}>
            Раунд {round.roundNumber}
          </div>
          <RoundDetail
            game={game}
            round={round}
            role={role}
            username={username}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </div>
  )
}
