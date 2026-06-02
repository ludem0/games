import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame } from '@/lib/minigames'
import { getPsigems, savePsigems } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string }> }

export async function POST(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (game.rewardsDistributed) return NextResponse.json({ error: 'Already distributed' }, { status: 400 })

  const pts = game.totalPoints
  const participants = game.participants
  const sorted = [...participants].sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0))
  const topScore = pts[sorted[0]] ?? 0
  const bottomScore = pts[sorted[sorted.length - 1]] ?? 0

  // top 3 psigems
  const top3 = sorted.slice(0, 3)
  const psigemGrants: Record<string, number> = {}
  for (const p of top3) psigemGrants[p] = (psigemGrants[p] ?? 0) + 1

  // sole winner: 2 immunity tokens + opal (returned as metadata, not stored here)
  const topPlayers = participants.filter(p => (pts[p] ?? 0) === topScore)
  const soleWinner = topPlayers.length === 1 ? topPlayers[0] : null

  // elimination candidate (lowest)
  const bottomPlayers = participants.filter(p => (pts[p] ?? 0) === bottomScore)
  const eliminationCandidates = bottomPlayers

  // opal challenge: closest to average
  const avg = participants.reduce((s, p) => s + (pts[p] ?? 0), 0) / participants.length
  const opalWinner = participants.reduce((best, p) => {
    return Math.abs((pts[p] ?? 0) - avg) < Math.abs((pts[best] ?? 0) - avg) ? p : best
  }, participants[0])

  // merge in-game psigems into season psigems
  const seasonPsigems = getPsigems(game.seasonSlug)
  for (const [p, amt] of Object.entries(game.psigemBalance)) {
    seasonPsigems[p] = (seasonPsigems[p] ?? 0) + amt
  }
  for (const [p, amt] of Object.entries(psigemGrants)) {
    seasonPsigems[p] = (seasonPsigems[p] ?? 0) + amt
  }
  savePsigems(game.seasonSlug, seasonPsigems)

  const updated = { ...game, status: 'finished' as const, rewardsDistributed: true }
  saveMinigame(slug, updated)

  return NextResponse.json({
    soleWinner,
    topPlayers,
    eliminationCandidates,
    opalWinner,
    averagePoints: Math.round(avg * 10) / 10,
    psigemGrants,
    finalStandings: sorted.map(p => ({ username: p, points: pts[p] ?? 0 })),
  })
}
