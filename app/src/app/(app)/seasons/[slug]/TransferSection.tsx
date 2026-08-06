'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './season.module.css'

interface Props {
  slug: string
  accent: string
  username: string
  participants: string[]
  deathMatchRunning: boolean
}

export default function TransferSection({ slug, accent, username, participants, deathMatchRunning }: Props) {
  const [balance, setBalance] = useState(0)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState(1)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const loadBalance = useCallback(async () => {
    const res = await fetch(`/api/seasons/${slug}/inventory`)
    if (!res.ok) return
    const list = await res.json()
    const mine = list.find((e: { username: string }) => e.username === username)
    setBalance(mine?.psigems ?? 0)
  }, [slug, username])

  useEffect(() => { loadBalance() }, [loadBalance])

  async function transfer() {
    setError('')
    setDone('')
    setSending(true)
    const res = await fetch(`/api/seasons/${slug}/psigems/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, amount }),
    })
    setSending(false)
    let data: { error?: string; amount?: number; to?: string; balance?: number }
    try { data = await res.json() } catch { data = { error: `Ошибка ${res.status}` } }
    if (!res.ok) { setError(data.error ?? `Ошибка ${res.status}`); return }
    setDone(`Передано ${data.amount} Ψ игроку ${data.to}`)
    setBalance(data.balance ?? 0)
    setAmount(1)
    setTo('')
  }

  const others = participants.filter(p => p !== username)
  const canSend = !deathMatchRunning && to !== '' && amount >= 1 && amount <= balance && !sending

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>ПЕРЕДАТЬ ПСИГЕМЫ</span>
        <span className={styles.transferBalance}>у вас Ψ {balance}</span>
      </div>

      {deathMatchRunning ? (
        <p className={styles.transferLocked}>Идёт Death Match. Передача псигемов закрыта до его завершения.</p>
      ) : (
        <>
          <div className={styles.transferRow}>
            <select className={styles.transferSelect} value={to} onChange={e => setTo(e.target.value)}>
              <option value="">Кому</option>
              {others.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={styles.transferAmount} type="number" min={1} max={Math.max(1, balance)}
              value={amount} onChange={e => setAmount(Number(e.target.value))} />
            <button className={styles.btnSolid} style={{ background: accent }} disabled={!canSend} onClick={transfer}>
              {sending ? '...' : 'Передать'}
            </button>
          </div>
          {balance === 0 && <p className={styles.noContent}>У вас нет псигемов</p>}
        </>
      )}

      {error && <p className={styles.chatError}>{error}</p>}
      {done && <p className={styles.transferDone}>{done}</p>}
    </div>
  )
}
