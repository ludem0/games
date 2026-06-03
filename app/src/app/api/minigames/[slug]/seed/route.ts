import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame } from '@/lib/minigames'
import { getDefaultRoundLayouts } from '@/lib/trackTroubleLayouts'

type Params = { params: Promise<{ slug: string }> }

// Reapply the reference layouts to all pending rounds (admin only).
export async function POST(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const defaults = getDefaultRoundLayouts()
  let applied = 0
  for (const round of game.rounds) {
    if (round.phase !== 'pending') continue
    const def = defaults[round.roundNumber - 1]
    if (def) {
      round.layout = JSON.parse(JSON.stringify(def))
      applied++
    }
  }

  saveMinigame(slug, game)
  return NextResponse.json({ applied, game })
}
