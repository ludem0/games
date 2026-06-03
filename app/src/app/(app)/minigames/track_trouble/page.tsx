import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getMinigame } from '@/lib/minigames'
import TrackTroubleClient from './TrackTroubleClient'

export default async function TrackTroublePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const game = getMinigame('track_trouble')
  if (!game) notFound()

  const filteredGame = user.role !== 'admin' ? {
    ...game,
    rounds: game.rounds.map(r => ({
      ...r,
      layout: r.phase === 'pending' ? { tracks: [], switches: [], peekUnlocked: r.layout.peekUnlocked } : r.layout,
      submissions: r.submissions.filter(s => s.username === user.username),
    })),
  } : game

  return (
    <TrackTroubleClient
      game={filteredGame}
      username={user.username}
      role={user.role}
    />
  )
}
