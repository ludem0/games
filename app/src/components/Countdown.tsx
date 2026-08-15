'use client'

import { useState, useEffect } from 'react'
import styles from './Countdown.module.css'

/**
 * The one countdown every game shares. Shows hours only when they matter, ticks
 * once a second, and turns red on the last thirty seconds of a short clock or
 * the last hour of a long one.
 */
export default function Countdown({ deadline }: { deadline: number | string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // half the engines publish a timestamp, the other half an ISO string
  const at = typeof deadline === 'number' ? deadline : new Date(deadline).getTime()
  const left = Math.max(0, at - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)

  // one rule for every clock: the last minute burns red
  const low = left < 60000
  const text = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`

  return <span className={low ? styles.clockLow : styles.clock}>{text}</span>
}
