'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { MinigameData } from '@/lib/minigames'
import styles from './season.module.css'

interface Props {
  seasonSlug: string
  isAdmin: boolean
  participants: string[]
}

export default function MinigamesSection({ seasonSlug, isAdmin, participants }: Props) {
  const router = useRouter()
  const [games, setGames] = useState<MinigameData[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([...participants])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/minigames')
      .then(r => r.ok ? r.json() : {})
      .then((all: Record<string, MinigameData>) => {
        setGames(Object.values(all).filter(g => g.seasonSlug === seasonSlug))
      })
      .catch(() => {})
  }, [seasonSlug])

  function toggleParticipant(p: string) {
    setSelectedParticipants(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Введите название'); return }
    if (selectedParticipants.length === 0) { setError('Выберите участников'); return }
    setCreating(true)
    setError('')
    const res = await fetch('/api/minigames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), seasonSlug, participants: selectedParticipants }),
    })
    setCreating(false)
    if (res.ok) {
      const game: MinigameData = await res.json()
      router.push(`/minigames/${game.id}`)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Ошибка')
    }
  }

  const STATUS_LABELS: Record<string, string> = { setup: 'Настройка', active: 'Активна', finished: 'Завершена' }

  return (
    <div className={styles.sectionCard} style={{ marginBottom: 0 }}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>МИНИ-ИГРЫ</span>
        {isAdmin && (
          <button className={styles.btnOutline} onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Отмена' : '+ Создать'}
          </button>
        )}
      </div>

      {/* Create form */}
      {isAdmin && showForm && (
        <div className={styles.minigameCreateForm}>
          <input
            className={styles.minigameInput}
            placeholder="Название игры"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className={styles.minigameParticipantsLabel}>Участники:</div>
          <div className={styles.minigameParticipantsPicker}>
            {participants.map(p => (
              <button
                key={p}
                className={`${styles.minigameParticipantBtn} ${selectedParticipants.includes(p) ? styles.minigameParticipantBtnActive : ''}`}
                onClick={() => toggleParticipant(p)}
                type="button"
              >
                {p}
              </button>
            ))}
          </div>
          {error && <div className={styles.minigameError}>{error}</div>}
          <button className={styles.minigameCreateBtn} onClick={handleCreate} disabled={creating}>
            {creating ? 'Создаю...' : 'Создать и открыть'}
          </button>
        </div>
      )}

      {/* Games list */}
      {games.length === 0 && !showForm && (
        <p className={styles.noContent}>Мини-игры не созданы</p>
      )}
      {games.length > 0 && (
        <div className={styles.minigameList}>
          {games.map(g => (
            <a key={g.id} href={`/minigames/${g.id}`} className={styles.minigameCard}>
              <div className={styles.minigameCardName}>{g.name}</div>
              <div className={styles.minigameCardMeta}>
                <span className={styles.minigameCardStatus}>{STATUS_LABELS[g.status] ?? g.status}</span>
                <span className={styles.minigameCardPlayers}>{g.participants.length} игроков</span>
                <span className={styles.minigameCardRounds}>
                  {g.rounds.filter(r => r.phase === 'complete').length}/9 раундов
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
