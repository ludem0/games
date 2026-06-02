import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame } from '@/lib/minigames'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

export async function POST(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug, roundNum } = await params
  const n = parseInt(roundNum)
  if (isNaN(n) || n < 1 || n > 9) return NextResponse.json({ error: 'Invalid round' }, { status: 400 })

  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  if (round.phase === 'pending') {
    round.phase = 'crossing1_open'
    round.phaseDeadline = deadline
    // set available chains for crossing 2 (all chains)
    round.availableChainsForCrossing2 = round.layout.tracks.flatMap(t => t.chains.map(c => c.id))
    if (game.status === 'setup') game.status = 'active'
  } else if (round.phase === 'crossing1_open') {
    return NextResponse.json({ error: 'Crossing 1 still open — resolve it first' }, { status: 400 })
  } else if (round.results.length === 1 && round.phase !== 'crossing2_open') {
    // crossing 1 resolved, open crossing 2
    round.phase = 'crossing2_open'
    round.phaseDeadline = deadline
  } else {
    return NextResponse.json({ error: 'Cannot open — check current phase' }, { status: 400 })
  }

  saveMinigame(slug, game)
  return NextResponse.json(round)
}
