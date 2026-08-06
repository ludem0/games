import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor, applyClock } from '@/lib/letterbox'
import { getParticipants } from '@/lib/seasons'
import LetterboxClient from './LetterboxClient'

export default async function LetterboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  const view = viewFor(applyClock(game), user.username, user.role === 'admin')
  const roster = getParticipants(game.seasonSlug)

  return (
    <LetterboxClient
      slug={slug}
      initialView={view}
      username={user.username}
      role={user.role}
      roster={roster}
      seasonSlug={game.seasonSlug}
    />
  )
}
