import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getMinigame } from '@/lib/minigames'
import MinigameClient from './MinigameClient'

export default async function MinigamePage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) notFound()

  // strip future round layouts for non-admin
  const filteredGame = user.role !== 'admin' ? {
    ...game,
    rounds: game.rounds.map(r => ({
      ...r,
      layout: r.phase === 'pending' ? { tracks: [], switches: [], peekUnlocked: r.layout.peekUnlocked } : r.layout,
      submissions: r.submissions.filter(s => s.username === user.username),
    })),
  } : game

  return (
    <MinigameClient
      game={filteredGame}
      username={user.username}
      role={user.role}
    />
  )
}
