'use client'

import { useState } from 'react'
import type { MinecartRound, SubmissionAction } from '@/lib/minigames'
import styles from './minigame.module.css'

interface Props {
  gameSlug: string
  round: MinecartRound
  username: string
  playerSide: 'north' | 'south'
  crossingNumber: 1 | 2
  onSubmitted: () => void
}

export default function SubmissionForm({ gameSlug, round, username, playerSide, crossingNumber, onSubmitted }: Props) {
  const [mode, setMode] = useState<'board' | 'switch' | 'stay'>('board')
  const [selectedChainId, setSelectedChainId] = useState('')
  const [selectedTrackId, setSelectedTrackId] = useState('')
  const [selectedSwitchId, setSelectedSwitchId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const existingSub = round.submissions.find(s => s.username === username && s.crossingNumber === crossingNumber)

  // available chains: on non-greyed tracks, not departed in crossing 2
  const availableChains = round.layout.tracks
    .filter(t => !t.isGreyed)
    .flatMap(t => t.chains
      .filter(c => crossingNumber === 1 || round.availableChainsForCrossing2.includes(c.id))
      .map(c => ({ ...c, trackId: t.id, trackColor: t.color }))
    )

  // available switches: active, on player's side
  const availableSwitches = round.layout.switches.filter(s => s.active && s.side === playerSide)

  async function submit() {
    let action: SubmissionAction
    if (mode === 'board') {
      if (!selectedChainId) { setError('Выберите вагонетку'); return }
      action = { type: 'board', chainId: selectedChainId, trackId: selectedTrackId }
    } else if (mode === 'switch') {
      if (!selectedSwitchId) { setError('Выберите переключатель'); return }
      action = { type: 'switch', switchId: selectedSwitchId }
    } else {
      action = { type: 'stay' }
    }

    setSaving(true)
    setError('')
    const res = await fetch(`/api/minigames/${gameSlug}/rounds/${round.roundNumber}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setSaving(false)
    if (res.ok) {
      onSubmitted()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Ошибка')
    }
  }

  if (existingSub) {
    const a = existingSub.action
    const label = a.type === 'board'
      ? `Вагонетка (${availableChains.find(c => c.id === a.chainId)?.destination ?? a.chainId})`
      : a.type === 'switch'
        ? `Переключатель (${availableSwitches.find(s => s.id === (a as { switchId: string }).switchId)?.color ?? ''})`
        : 'Остаться'
    return (
      <div className={styles.submittedBadge}>
        ✅ Заявка принята: <strong>{label}</strong>
        <button className={styles.resubmitBtn} onClick={() => onSubmitted()}>Изменить</button>
      </div>
    )
  }

  return (
    <div className={styles.subForm}>
      <div className={styles.subFormTitle}>Пересечение {crossingNumber} — Ваш ход</div>
      <div className={styles.subSideInfo}>Вы на стороне: <strong>{playerSide === 'south' ? '⛏ Юг' : '🏔 Север'}</strong></div>

      <div className={styles.subModes}>
        <button className={`${styles.subMode} ${mode === 'board' ? styles.subModeActive : ''}`} onClick={() => setMode('board')}>🚃 Сесть в вагонетку</button>
        <button className={`${styles.subMode} ${mode === 'switch' ? styles.subModeActive : ''}`} onClick={() => setMode('switch')} disabled={availableSwitches.length === 0}>⚡ Переключатель</button>
        <button className={`${styles.subMode} ${mode === 'stay' ? styles.subModeActive : ''}`} onClick={() => setMode('stay')}>⏸ Остаться (0 очков)</button>
      </div>

      {mode === 'board' && (
        <div className={styles.subOptions}>
          {availableChains.length === 0 && <div className={styles.subNoOpts}>Нет доступных вагонеток</div>}
          {availableChains.map(chain => (
            <label key={chain.id} className={`${styles.subOption} ${selectedChainId === chain.id ? styles.subOptionSelected : ''}`}
              style={{ borderColor: selectedChainId === chain.id ? chain.color : undefined }}>
              <input type="radio" name="chain" value={chain.id}
                checked={selectedChainId === chain.id}
                onChange={() => { setSelectedChainId(chain.id); setSelectedTrackId(chain.trackId) }} />
              <span className={styles.chainDot} style={{ background: chain.color }} />
              <span className={styles.subOptName}>{chain.destination}</span>
              <span className={styles.subOptCap}>×{chain.capacity} игроков</span>
              <span className={styles.subOptPts}>{chain.points} очков</span>
            </label>
          ))}
        </div>
      )}

      {mode === 'switch' && (
        <div className={styles.subOptions}>
          {availableSwitches.map(sw => (
            <label key={sw.id} className={`${styles.subOption} ${selectedSwitchId === sw.id ? styles.subOptionSelected : ''}`}
              style={{ borderColor: selectedSwitchId === sw.id ? sw.color : undefined }}>
              <input type="radio" name="sw" value={sw.id}
                checked={selectedSwitchId === sw.id}
                onChange={() => setSelectedSwitchId(sw.id)} />
              <span className={styles.chainDot} style={{ background: sw.color }} />
              <span className={styles.subOptName}>Переключатель {sw.color}</span>
              <span className={styles.subOptCap}>Меняет пути</span>
            </label>
          ))}
        </div>
      )}

      {mode === 'stay' && (
        <div className={styles.stayWarning}>Вы получите 0 очков за это пересечение.</div>
      )}

      {error && <div className={styles.subError}>{error}</div>}

      <button className={styles.subSubmitBtn} onClick={submit} disabled={saving}>
        {saving ? 'Отправляю...' : 'Подтвердить выбор'}
      </button>
    </div>
  )
}
