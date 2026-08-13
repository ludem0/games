import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor } from '@/lib/elevatorRace'
import ElevatorRaceClient from './ElevatorRaceClient'

export default async function ElevatorRacePage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  // the clock only moves on the API route, which is allowed to touch balances
  return (
    <ElevatorRaceClient
      slug={slug}
      initialView={viewFor(game, user.username)}
      username={user.username}
      role={user.role}
    />
  )
}
