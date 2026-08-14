import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor, applyClock } from '@/lib/pathing'
import { getParticipants } from '@/lib/seasons'
import PathingClient from './PathingClient'

export default async function PathingPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  return (
    <PathingClient
      slug={slug}
      initialView={viewFor(applyClock(game), user.username)}
      username={user.username}
      role={user.role}
      roster={getParticipants(game.seasonSlug)}
    />
  )
}
