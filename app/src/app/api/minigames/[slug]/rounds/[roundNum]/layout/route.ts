import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame } from '@/lib/minigames'

type Params = { params: Promise<{ slug: string; roundNum: string }> }

export async function PUT(req: Request, { params }: Params) {
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

  const layout = await req.json()
  const round = game.rounds.find(r => r.roundNumber === n)
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  round.layout = layout
  saveMinigame(slug, game)
  return NextResponse.json(round)
}
