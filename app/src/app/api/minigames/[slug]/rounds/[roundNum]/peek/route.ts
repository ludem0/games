import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame } from '@/lib/minigames'
import { getPsigems, savePsigems } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

const PEEK_COST = 2

export async function POST(_req: Request, { params }: Params) {
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

  if (!game.participants.includes(user.username)) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  if (!round.layout.peekUnlocked) return NextResponse.json({ error: 'Peek not unlocked for this round' }, { status: 400 })
  if (round.phase !== 'pending') return NextResponse.json({ error: 'Round already started' }, { status: 400 })

  const alreadyPeeked = (game.peeks[user.username] ?? []).includes(n)
  if (alreadyPeeked) return NextResponse.json({ error: 'Already peeked this round' }, { status: 400 })

  const psigems = getPsigems(game.seasonSlug)
  const balance = psigems[user.username] ?? 0
  if (balance < PEEK_COST) return NextResponse.json({ error: 'Not enough psigems' }, { status: 400 })

  psigems[user.username] = balance - PEEK_COST
  savePsigems(game.seasonSlug, psigems)

  game.peeks[user.username] = [...(game.peeks[user.username] ?? []), n]
  saveMinigame(slug, game)

  return NextResponse.json({ layout: round.layout })
}
