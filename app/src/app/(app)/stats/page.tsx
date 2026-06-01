import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, getUsers } from '@/lib/auth'
import { getAllSeasons } from '@/lib/seasons'
import { SEASONS_CONFIG, DONE_SEASONS } from '@/lib/seasonsConfig'
import { computeAllPlayerStats } from '@/lib/stats'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')

  const user = await verifyToken(token)
  if (!user) redirect('/login')
  if (user.role === 'viewer') redirect('/')

  const allSeasons = getAllSeasons()
  const doneSeasonsWithMeta = DONE_SEASONS.map(([slug, cfg]) => ({
    slug,
    seasonName: cfg.name,
    ...(allSeasons[slug] ?? { participants: [], psigems: {}, rounds: [] }),
  }))

  const allUsers = getUsers()
  const allPlayers = allUsers.filter(u => u.role === 'player').map(u => u.username)

  // Include all participants from done seasons (may include admin who played)
  const allParticipants = Array.from(new Set([
    ...allPlayers,
    ...doneSeasonsWithMeta.flatMap(s => s.participants),
  ]))

  const allStats = computeAllPlayerStats(allParticipants, doneSeasonsWithMeta)

  return (
    <StatsClient
      username={user.username}
      role={user.role}
      allStats={allStats}
      allPlayers={allParticipants}
    />
  )
}
