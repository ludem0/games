import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getMinigame, syncParticipants } from '@/lib/minigames'
import { getParticipants } from '@/lib/seasons'
import MinigameClient from './MinigameClient'

export default async function MinigamePage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const stored = getMinigame(slug)
  if (!stored) notFound()
  // the season owns the roster, so a game inside one always reflects it
  const game = (stored.seasonSlug ? syncParticipants(slug, getParticipants(stored.seasonSlug)) : stored) ?? stored

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
