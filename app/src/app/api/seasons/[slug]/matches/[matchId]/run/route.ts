import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getMatches, startMatch, stopMatch } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string; matchId: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

// Starting a match freezes the standings for players; stopping it lets them move again.
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, matchId } = await params

  if (!getMatches(slug).some(m => m.id === matchId)) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const { running } = await req.json() as { running?: boolean }
  const match = running ? startMatch(slug, matchId) : stopMatch(slug, matchId)
  return NextResponse.json({ match, matches: getMatches(slug) })
}
