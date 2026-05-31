import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getRounds, saveRounds } from '@/lib/seasons'
import type { Round } from '@/lib/seasons'

type Params = { params: Promise<{ slug: string; id: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, id } = await params
  const rounds = getRounds(slug).filter(r => r.id !== id)
  // re-number
  const renumbered = rounds.map((r, i) => ({ ...r, number: i + 1 }))
  saveRounds(slug, renumbered)
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, id } = await params
  const body = await req.json() as Partial<Round>
  const rounds = getRounds(slug)
  const updated = rounds.map(r => r.id === id ? { ...r, ...body, id: r.id, number: r.number } : r)
  saveRounds(slug, updated)
  return NextResponse.json({ ok: true })
}
