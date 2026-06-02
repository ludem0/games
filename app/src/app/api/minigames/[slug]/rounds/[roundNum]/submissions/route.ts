import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame } from '@/lib/minigames'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

export async function GET(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug, roundNum } = await params
  const n = parseInt(roundNum)
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const currentCrossing: 1 | 2 = round.phase === 'crossing2_open' ? 2 : 1
  const submitted = round.submissions
    .filter(s => s.crossingNumber === currentCrossing)
    .map(s => s.username)
  const pending = game.participants.filter(p => !submitted.includes(p))

  return NextResponse.json({
    submissions: round.submissions.filter(s => s.crossingNumber === currentCrossing),
    submitted,
    pending,
    phase: round.phase,
    deadline: round.phaseDeadline,
  })
}
