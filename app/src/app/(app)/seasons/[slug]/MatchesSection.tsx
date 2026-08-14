'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Match } from '@/lib/seasons'
import styles from './matches.module.css'

interface Props {
  slug: string
  isAdmin: boolean
  initialMatches: Match[]
}

interface EditState {
  name: string
  minigameSlug: string
}

function MatchCard({
  match,
  isAdmin,
  onToggleVisible,
  onToggleAccessible,
  onToggleRunning,
  onDelete,
  onSave,
}: {
  match: Match
  isAdmin: boolean
  onToggleVisible: () => void
  onToggleAccessible: () => void
  onToggleRunning: () => void
  onDelete: () => void
  onSave: (edit: EditState) => void
}) {
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditState>({ name: match.name, minigameSlug: match.minigameSlug ?? '' })

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
            className={styles.iconBtn}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleRunning() }}
            title={match.running ? 'Завершить матч' : 'Начать матч'}
          >{match.running ? '⏹' : '▶'}</button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete() }}
            title="Удалить"
          >✕</button>
        </div>
      )}

      {match.running && <span className={styles.runningTag}>идёт</span>}

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
          {isMain && (
            <div onClick={e => e.stopPropagation()} style={{ fontSize: '0.72rem', opacity: 0.55 }}>
              Игра создаётся вместе с матчем
            </div>
          )}
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

  // each game has its own page
  const GAME_PATHS = {
    track_trouble: '/minigames', double_team: '/doubleteam',
    letterbox: '/letterbox', ultimate_ttt: '/ultimate', swapping_bw: '/swapping',
    kings_court: '/kingscourt', elevator_race: '/elevatorrace',
    channel_hopping: '/channelhopping', pathing_dab: '/pathing', domino_bw: '/dominobw', puzzle_chambers: '/puzzlechambers', modular_rooms: '/modularrooms', field_tactics: '/fieldtactics', locked_out: '/lockedout', number_janggi: '/numberjanggi', the_cube: '/thecube', possession: '/possession', totemic: '/totemic', conveyor: '/conveyor', tug_of_war: '/tugofwar', element: '/element',
  }
  const gameHref = `${GAME_PATHS[match.game ?? (isMain ? 'track_trouble' : 'letterbox')]}/${match.minigameSlug}`

  if (match.minigameSlug && (playerCanClick || isAdmin)) {
    return (
      <Link href={gameHref} className={cardClass} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    )
  }

  return <div className={cardClass}>{inner}</div>
}

export default function MatchesSection({ slug, isAdmin, initialMatches }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches)

  async function addMatch(type: 'main' | 'death', game?: Match['game']) {
    const res = await fetch(`/api/seasons/${slug}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, game }),
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

  async function toggleRunning(id: string, running: boolean) {
    const res = await fetch(`/api/seasons/${slug}/matches/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ running }),
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
              <>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'track_trouble')}>+ Track Trouble</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'double_team')}>+ Double Team</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'kings_court')}>+ King&apos;s Court</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'elevator_race')}>+ Elevator Race</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'puzzle_chambers')}>+ Puzzle Sum Chambers</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'modular_rooms')}>+ Three Modular Rooms</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'locked_out')}>+ Locked Out!</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'the_cube')}>+ The Cube</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'possession')}>+ Five Fold Possession</button>
                <button className={styles.addBtn} onClick={() => addMatch('main', 'totemic')}>+ Totemic Might</button>
              </>
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
                  onToggleRunning={() => toggleRunning(m.id, !m.running)}
                  onDelete={() => deleteMatch(m.id)}
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
              <>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'letterbox')}>+ Letterbox</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'ultimate_ttt')}>+ Ultimate Tic Tac Toe</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'swapping_bw')}>+ Swapping Black and White</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'channel_hopping')}>+ Channel Hopping</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'pathing_dab')}>+ Pathing Dots and Boxes</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'domino_bw')}>+ Domino Black and White</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'field_tactics')}>+ Field Tactics</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'number_janggi')}>+ Number Janggi</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'conveyor')}>+ Conveyor</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'tug_of_war')}>+ Tug of War</button>
                <button className={styles.addBtn} onClick={() => addMatch('death', 'element')}>+ Element</button>
              </>
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
                  onToggleRunning={() => toggleRunning(m.id, !m.running)}
                  onDelete={() => deleteMatch(m.id)}
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
