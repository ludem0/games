import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame, createEmptyRound, type MinigameData } from '@/lib/minigames'
import { getParticipants } from '@/lib/seasons'
import { getDefaultRoundLayouts } from '@/lib/trackTroubleLayouts'

type Params = { params: Promise<{ slug: string }> }

// Start the game over: fresh layouts, no submissions, no points. The game itself
// stays where it is, since it belongs to its match.
export async function POST(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // follow the season roster, but never wipe the game's own when the season has none
  const fromSeason = game.seasonSlug ? getParticipants(game.seasonSlug) : []
  const participants = fromSeason.length > 0 ? fromSeason : game.participants
  const layouts = getDefaultRoundLayouts()

  const fresh: MinigameData = {
    ...game,
    status: 'setup',
    participants,
    rounds: layouts.map((layout, i) => ({ ...createEmptyRound(i + 1), layout })),
    totalPoints: Object.fromEntries(participants.map(p => [p, 0])),
    psigemBalance: Object.fromEntries(participants.map(p => [p, 0])),
    peeks: {},
    rewardsDistributed: false,
  }

  saveMinigame(slug, fresh)
  return NextResponse.json(fresh)
}
