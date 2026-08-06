import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { getGame, viewFor } from '@/lib/doubleTeam'
import DoubleTeamClient from './DoubleTeamClient'

export default async function DoubleTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) redirect('/login')
  const user = await verifyToken(token)
  if (!user) redirect('/login')

  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()

  return (
    <DoubleTeamClient
      slug={slug}
      initialView={viewFor(game, user.username, user.role === 'admin')}
      username={user.username}
      role={user.role}
    />
  )
}
