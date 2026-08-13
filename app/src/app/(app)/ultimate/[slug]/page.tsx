import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor, applyClock } from '@/lib/ultimate'
import { getParticipants, getPsigems } from '@/lib/seasons'
import UltimateClient from './UltimateClient'

export default async function UltimatePage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  const view = viewFor(applyClock(game), user.username)
  const roster = getParticipants(game.seasonSlug)
  // the host applies the starting player rule by hand, so they need the balances
  const psigems = user.role === 'admin' ? getPsigems(game.seasonSlug) : {}

  return (
    <UltimateClient
      slug={slug}
      initialView={view}
      username={user.username}
      role={user.role}
      roster={roster}
      psigems={psigems}
    />
  )
}
