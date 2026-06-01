import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken, getUsers } from '@/lib/auth'
import { getParticipants, getRounds, getPsigems } from '@/lib/seasons'
import { SEASONS_CONFIG } from '@/lib/seasonsConfig'
import SeasonClient from './SeasonClient'

export default async function SeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const season = SEASONS_CONFIG[slug]
  if (!season) notFound()

  const participants = getParticipants(slug)
  const rounds = getRounds(slug)
  const psigems = getPsigems(slug)
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
      initialRounds={rounds}
      initialPsigems={psigems}
    />
  )
}
