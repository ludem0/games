'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Match } from '@/lib/seasons'
import styles from './matches.module.css'

interface Props {
  slug: string
  isAdmin: boolean
  initialMatches: Match[]
  participants: string[]
}

interface EditState {
  name: string
  minigameSlug: string
}

function MatchCard({
  match,
  isAdmin,
  seasonSlug,
  participants,
  onToggleVisible,
  onToggleAccessible,
  onDelete,
  onSave,
}: {
  match: Match
  isAdmin: boolean
  seasonSlug: string
  participants: string[]
  onToggleVisible: () => void
  onToggleAccessible: () => void
  onDelete: () => void
  onSave: (edit: EditState) => void
}) {
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditState>({ name: match.name, minigameSlug: match.minigameSlug ?? '' })
  const [creating, setCreating] = useState(false)

  async function createMinigame(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setCreating(true)
    const res = await fetch('/api/minigames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: edit.name || match.name, seasonSlug, participants }),
    })
    setCreating(false)
    if (res.ok) {
      const game = await res.json()
      setEdit(s => ({ ...s, minigameSlug: game.id }))
    }
  }

  const isMain = match.type === 'main'
  const playerCanClick = !isAdmin && match.accessible && match.visible
  const playerLocked = !isAdmin && (!match.accessible || !match.visible)

  const cardClass = [
    styles.card,
    isMain ? styles.cardMain : styles.cardDeath,
    playerLocked ? styles.cardLocked : '',
    playerCanClick ? styles.cardAccessible : '',
  ].filter(Boolean).join(' ')

  const icon = isMain ? '⚔️' : '💀'

  const inner = (
    <>
      {isAdmin && (
        <div className={styles.adminControls}>
          <button
            className={styles.iconBtn}
            onClick={e => { e.preventDefault(); e.stopPropagation(); setEditing(v => !v) }}
            title="Редактировать"
          >✏️</button>
          <button
            className={styles.iconBtn}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleVisible() }}
            title={match.visible ? 'Скрыть название' : 'Показать название'}
          >{match.visible ? '👁' : '🙈'}</button>
          <button
            className={styles.iconBtn}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleAccessible() }}
            title={match.accessible ? 'Закрыть доступ' : 'Открыть доступ'}
          >{match.accessible ? '🔓' : '🔒'}</button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete() }}
            title="Удалить"
          >✕</button>
        </div>
      )}

      <div className={`${styles.cardIconWrap} ${isMain ? styles.cardIconMain : styles.cardIconDeath}`}>
        {icon}
      </div>

      {editing && isAdmin ? (
        <>
          <input
            className={styles.nameInput}
            value={edit.name}
            onChange={e => setEdit(s => ({ ...s, name: e.target.value }))}
            placeholder="Название"
            onClick={e => e.stopPropagation()}
          />
          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
            <input
              className={styles.slugInput}
              style={{ flex: 1 }}
              value={edit.minigameSlug}
              onChange={e => setEdit(s => ({ ...s, minigameSlug: e.target.value }))}
              placeholder="mini-game slug"
            />
            <button
              className={styles.saveBtn}
              style={{ fontSize: '0.72rem', padding: '6px 10px', whiteSpace: 'nowrap' }}
              onClick={createMinigame}
              disabled={creating}
              title="Создать новую мини-игру и вставить slug"
            >{creating ? '...' : '+ Игра'}</button>
          </div>
          <button
            className={styles.saveBtn}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSave(edit); setEditing(false) }}
          >Сохранить</button>
        </>
      ) : (
        <>
          {isAdmin || match.visible ? (
            <span className={styles.cardName}>{match.name}</span>
          ) : (
            <span className={`${styles.cardName} ${styles.cardNameHidden}`}>???</span>
          )}

          <div className={styles.cardBadges}>
            {isAdmin && !match.visible && (
              <span className={`${styles.badge} ${styles.badgeHidden}`}>СКРЫТО</span>
            )}
            {match.accessible
              ? <span className={`${styles.badge} ${styles.badgeOpen}`}>ОТКРЫТ</span>
              : <span className={`${styles.badge} ${styles.badgeLocked}`}>🔒 ЗАКРЫТ</span>
            }
          </div>
        </>
      )}
    </>
  )

  if (playerCanClick && match.minigameSlug) {
    return (
      <Link href={`/minigames/${match.minigameSlug}`} className={cardClass} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    )
  }

  return <div className={cardClass}>{inner}</div>
}

export default function MatchesSection({ slug, isAdmin, initialMatches, participants }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches)

  async function addMatch(type: 'main' | 'death') {
    const res = await fetch(`/api/seasons/${slug}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name: type === 'main' ? 'Main Match' : 'Death Match' }),
    })
    if (res.ok) setMatches((await res.json()).matches)
  }

  async function updateMatch(id: string, patch: Partial<Match>) {
    const match = matches.find(m => m.id === id)
    if (!match) return
    const res = await fetch(`/api/seasons/${slug}/matches`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...match, ...patch }),
    })
    if (res.ok) setMatches((await res.json()).matches)
  }

  async function deleteMatch(id: string) {
    const res = await fetch(`/api/seasons/${slug}/matches?id=${id}`, { method: 'DELETE' })
    if (res.ok) setMatches((await res.json()).matches)
  }

  const mainMatches = matches.filter(m => m.type === 'main')
  const deathMatches = matches.filter(m => m.type === 'death')

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Матчи</span>
      </div>

      <div className={styles.groups}>
        {/* Main Matches */}
        <div className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={`${styles.groupTitle} ${styles.groupTitleMain}`}>
              <span className={styles.groupIcon}>⚔️</span>
              Main Matches
            </span>
            {isAdmin && (
              <button className={styles.addBtn} onClick={() => addMatch('main')}>+ Добавить</button>
            )}
          </div>
          {mainMatches.length === 0 ? (
            <p className={styles.empty}>Нет матчей</p>
          ) : (
            <div className={styles.cards}>
              {mainMatches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isAdmin={isAdmin}
                  onToggleVisible={() => updateMatch(m.id, { visible: !m.visible })}
                  onToggleAccessible={() => updateMatch(m.id, { accessible: !m.accessible })}
                  onDelete={() => deleteMatch(m.id)}
                  seasonSlug={slug}
                  participants={participants}
                  onSave={edit => updateMatch(m.id, { name: edit.name, minigameSlug: edit.minigameSlug || undefined })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Death Matches */}
        <div className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={`${styles.groupTitle} ${styles.groupTitleDeath}`}>
              <span className={styles.groupIcon}>💀</span>
              Death Matches
            </span>
            {isAdmin && (
              <button className={styles.addBtn} onClick={() => addMatch('death')}>+ Добавить</button>
            )}
          </div>
          {deathMatches.length === 0 ? (
            <p className={styles.empty}>Нет матчей</p>
          ) : (
            <div className={styles.cards}>
              {deathMatches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isAdmin={isAdmin}
                  onToggleVisible={() => updateMatch(m.id, { visible: !m.visible })}
                  onToggleAccessible={() => updateMatch(m.id, { accessible: !m.accessible })}
                  onDelete={() => deleteMatch(m.id)}
                  seasonSlug={slug}
                  participants={participants}
                  onSave={edit => updateMatch(m.id, { name: edit.name, minigameSlug: edit.minigameSlug || undefined })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
