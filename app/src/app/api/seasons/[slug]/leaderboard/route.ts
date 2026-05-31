import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getRanks, saveRanks, getParticipants } from '@/lib/seasons'

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
  return NextResponse.json({ ranks: getRanks(slug), participants: getParticipants(slug) })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const { ranks } = await req.json() as { ranks: string[] }
  saveRanks(slug, ranks)
  return NextResponse.json({ ok: true })
}
