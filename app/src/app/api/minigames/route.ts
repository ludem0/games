import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getAllMinigames, saveMinigame, createEmptyRound, type MinigameData } from '@/lib/minigames'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const all = getAllMinigames()
  return NextResponse.json(all)
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, seasonSlug, participants } = body
  if (!name || !seasonSlug || !Array.isArray(participants)) {
    return NextResponse.json({ error: 'name, seasonSlug, participants required' }, { status: 400 })
  }

  const slug = `${seasonSlug}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
  const game: MinigameData = {
    id: slug,
    seasonSlug,
    name,
    status: 'setup',
    participants,
    rounds: Array.from({ length: 9 }, (_, i) => createEmptyRound(i + 1)),
    totalPoints: Object.fromEntries(participants.map(p => [p, 0])),
    psigemBalance: Object.fromEntries(participants.map(p => [p, 0])),
    peeks: {},
    rewardsDistributed: false,
    createdAt: new Date().toISOString(),
  }

  saveMinigame(slug, game)
  return NextResponse.json(game, { status: 201 })
}
