import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, addParticipant, removeParticipant } from '@/lib/seasons'

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
  return NextResponse.json({ participants: getParticipants(slug) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const { username } = await req.json() as { username?: string }
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  addParticipant(slug, username)
  return NextResponse.json({ participants: getParticipants(slug) })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const { username } = await req.json() as { username?: string }
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  removeParticipant(slug, username)
  return NextResponse.json({ participants: getParticipants(slug) })
}
