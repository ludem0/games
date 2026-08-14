import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor, applyClock } from '@/lib/dominoBw'
import { getParticipants } from '@/lib/seasons'
import DominoBwClient from './DominoBwClient'

export default async function DominoBwPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  return (
    <DominoBwClient
      slug={slug}
      initialView={viewFor(applyClock(game), user.username, user.role === 'admin')}
      username={user.username}
      role={user.role}
      roster={getParticipants(game.seasonSlug)}
    />
  )
}
