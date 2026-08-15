'use client'

import { useEffect } from 'react'
import { useSocket } from './SocketProvider'

/**
 * Refreshes a game view the instant a move lands anywhere. Rides the socket every
 * page already holds; polling stays as the fallback for a dropped connection.
 */
export function useGameChannel(slug: string, refresh: () => void): void {
  const { addHandler } = useSocket()
  useEffect(() => addHandler(frame => {
    if (frame.type === 'game' && frame.slug === slug) refresh()
  }), [addHandler, slug, refresh])
}
