import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor } from '@/lib/lockedOut'
import { getParticipants } from '@/lib/seasons'
import LockedOutClient from './LockedOutClient'

export default async function LockedOutPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  // the clock only turns on the API route, which is allowed to pay out
  return (
    <LockedOutClient
      slug={slug}
      initialView={viewFor(game, user.username, user.role === 'admin')}
      username={user.username}
      role={user.role}
      roster={getParticipants(game.seasonSlug)}
    />
  )
}
