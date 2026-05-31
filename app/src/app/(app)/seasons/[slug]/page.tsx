import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken, getUsers } from '@/lib/auth'
import { getParticipants, getLeaderboard } from '@/lib/seasons'
import SeasonClient from './SeasonClient'

const SEASONS: Record<string, {
  name: string
  status: 'done' | 'active' | 'soon'
  statusLabel: string
  accent: string
}> = {
  simply: { name: 'PG: Simply',        status: 'done',   statusLabel: 'Завершён', accent: '#FFE033' },
  zero:   { name: 'PG: Zero',          status: 'done',   statusLabel: 'Завершён', accent: '#E0E0E0' },
  gambit: { name: 'PG: Puzzle Gambit', status: 'active', statusLabel: 'Идёт',     accent: '#B026FF' },
}

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const season = SEASONS[slug]
  if (!season) notFound()

  const participants = getParticipants(slug)
  const leaderboard = getLeaderboard(slug)
  const allPlayers = getUsers()
    .filter(u => u.role === 'player')
    .map(u => u.username)

  return (
    <SeasonClient
      slug={slug}
      name={season.name}
      status={season.status}
      statusLabel={season.statusLabel}
      accent={season.accent}
      role={user.role}
      username={user.username}
      initialParticipants={participants}
      allPlayers={allPlayers}
      initialLeaderboard={leaderboard}
    />
  )
}
