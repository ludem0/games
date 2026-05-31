import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getRounds, saveRounds } from '@/lib/seasons'
import type { Round } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  return NextResponse.json(getRounds(slug))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const body = await req.json() as Omit<Round, 'id' | 'number'>
  const rounds = getRounds(slug)
  const newRound: Round = {
    id: `r${Date.now()}`,
    number: rounds.length + 1,
    mainMatch: body.mainMatch,
    deathMatch: body.deathMatch ?? null,
  }
  saveRounds(slug, [...rounds, newRound])
  return NextResponse.json(newRound, { status: 201 })
}
