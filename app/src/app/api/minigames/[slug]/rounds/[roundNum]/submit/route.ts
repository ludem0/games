import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame, getPlayerPosition, type SubmissionAction } from '@/lib/minigames'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

export async function POST(req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug, roundNum } = await params
  const n = parseInt(roundNum)
  if (isNaN(n) || n < 1 || n > 9) return NextResponse.json({ error: 'Invalid round' }, { status: 400 })

  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!game.participants.includes(user.username) && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  if (round.phase !== 'crossing1_open' && round.phase !== 'crossing2_open') {
    return NextResponse.json({ error: 'No crossing open' }, { status: 400 })
  }
  const crossingNumber: 1 | 2 = round.phase === 'crossing1_open' ? 1 : 2

  if (round.phaseDeadline && new Date() > new Date(round.phaseDeadline)) {
    return NextResponse.json({ error: 'Deadline passed' }, { status: 400 })
  }

  const { action }: { action: SubmissionAction } = await req.json()
  const playerSide = getPlayerPosition(round, user.username, crossingNumber)

  // validate action matches player's side
  if (action.type === 'board') {
    let chainFound = false
    for (const track of round.layout.tracks) {
      if (track.isGreyed) continue
      const chain = track.chains.find(c => c.id === action.chainId)
      if (chain) {
        // chain must depart to player's opposite side (i.e., available from their side)
        if (crossingNumber === 2 && !round.availableChainsForCrossing2.includes(action.chainId)) {
          return NextResponse.json({ error: 'Chain already departed' }, { status: 400 })
        }
        chainFound = true
        break
      }
    }
    if (!chainFound) return NextResponse.json({ error: 'Chain not found' }, { status: 400 })
  }

  if (action.type === 'switch') {
    const sw = round.layout.switches.find(s => s.id === action.switchId)
    if (!sw) return NextResponse.json({ error: 'Switch not found' }, { status: 400 })
    if (sw.side !== playerSide) return NextResponse.json({ error: 'Switch is on other side' }, { status: 400 })
    if (!sw.active) return NextResponse.json({ error: 'Switch is inactive' }, { status: 400 })
  }

  // idempotent: replace existing submission for this user+crossing
  round.submissions = round.submissions.filter(
    s => !(s.username === user.username && s.crossingNumber === crossingNumber)
  )
  round.submissions.push({
    username: user.username,
    crossingNumber,
    action,
    submittedAt: new Date().toISOString(),
  })

  saveMinigame(slug, game)
  return NextResponse.json({ ok: true, action, crossingNumber })
}
