'use client'

import { useSocket } from '@/components/SocketProvider'
import styles from './season.module.css'

interface Props {
  accent: string
  username: string
  participants: string[]
}

// The online list comes straight from the open sockets, so it needs no polling.
export default function OnlineSection({ accent, username, participants }: Props) {
  const { online, connected } = useSocket()
  const inSeason = online.filter(u => participants.includes(u))
  const others = online.filter(u => !participants.includes(u))

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>КТО ОНЛАЙН</span>
        <span className={connected ? styles.chatLive : styles.chatOffline}>
          {connected ? `${online.length} на сайте` : 'нет связи'}
        </span>
      </div>

      {online.length === 0 ? (
        <p className={styles.noContent}>Никого нет</p>
      ) : (
        <div className={styles.onlineList}>
          {[...inSeason, ...others].map(u => (
            <span key={u} className={styles.onlineChip}
              style={participants.includes(u) ? { borderColor: `${accent}66`, color: accent } : undefined}>
              <span className={styles.onlineDot} />
              {u}{u === username && ' (вы)'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
