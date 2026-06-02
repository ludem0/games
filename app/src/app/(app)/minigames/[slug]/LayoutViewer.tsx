'use client'

import type { RoundLayout } from '@/lib/minigames'
import styles from './minigame.module.css'

interface Props {
  layout: RoundLayout
  playerSide: 'north' | 'south'
  availableChains?: string[]  // for crossing 2
  crossingNumber?: 1 | 2
}

export default function LayoutViewer({ layout, playerSide, availableChains, crossingNumber }: Props) {
  const northSwitches = layout.switches.filter(s => s.side === 'north')
  const southSwitches = layout.switches.filter(s => s.side === 'south')

  if (layout.tracks.length === 0) {
    return <div className={styles.layoutEmpty}>Макет не настроен</div>
  }

  return (
    <div className={styles.layoutWrap}>
      {/* North side */}
      <div className={`${styles.layoutSide} ${playerSide === 'north' ? styles.layoutSideActive : ''}`}>
        <div className={styles.layoutSideLabel}>🏔 СЕВЕР {playerSide === 'north' ? '← ВЫ ЗДЕСЬ' : ''}</div>
        <div className={styles.layoutSwitches}>
          {northSwitches.map(sw => (
            <div key={sw.id} className={`${styles.switchChip} ${!sw.active ? styles.switchInactive : ''}`}
              style={{ borderColor: sw.active ? sw.color : '#555', color: sw.active ? sw.color : '#555' }}>
              ⚡ {sw.color}
            </div>
          ))}
        </div>
      </div>

      {/* Tracks (ravine) */}
      <div className={styles.layoutRavine}>
        <div className={styles.ravineLabel}>━━━ ПРОПАСТЬ ━━━</div>
        <div className={styles.trackList}>
          {layout.tracks.map(track => {
            const isGreyed = track.isGreyed
            return (
              <div key={track.id} className={`${styles.trackRow} ${isGreyed ? styles.trackGreyed : ''}`}
                style={{ borderColor: isGreyed ? '#555' : track.color }}>
                <div className={styles.trackColor} style={{ background: isGreyed ? '#555' : track.color }} />
                <div className={styles.trackChains}>
                  {track.chains.map(chain => {
                    const unavailable = crossingNumber === 2 && availableChains && !availableChains.includes(chain.id)
                    return (
                      <div key={chain.id}
                        className={`${styles.chainChip} ${unavailable ? styles.chainDeparted : ''}`}
                        style={{ borderColor: unavailable ? '#555' : chain.color }}>
                        <span className={styles.chainColor} style={{ background: unavailable ? '#555' : chain.color }} />
                        <span className={styles.chainDest}>{chain.destination}</span>
                        <span className={styles.chainCap}>×{chain.capacity}</span>
                        <span className={styles.chainPts}>{chain.points}pts</span>
                        {unavailable && <span className={styles.chainGone}>отбыл</span>}
                      </div>
                    )
                  })}
                </div>
                {isGreyed && <div className={styles.trackGreyedBadge}>ОТКЛЮЧЁН</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* South side */}
      <div className={`${styles.layoutSide} ${playerSide === 'south' ? styles.layoutSideActive : ''}`}>
        <div className={styles.layoutSideLabel}>⛏ ЮГ {playerSide === 'south' ? '← ВЫ ЗДЕСЬ' : ''}</div>
        <div className={styles.layoutSwitches}>
          {southSwitches.map(sw => (
            <div key={sw.id} className={`${styles.switchChip} ${!sw.active ? styles.switchInactive : ''}`}
              style={{ borderColor: sw.active ? sw.color : '#555', color: sw.active ? sw.color : '#555' }}>
              ⚡ {sw.color}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
