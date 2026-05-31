import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getPsigems, savePsigems } from '@/lib/seasons'

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
  return NextResponse.json(getPsigems(slug))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const body = await req.json() as Record<string, number>
  savePsigems(slug, body)
  return NextResponse.json(getPsigems(slug))
}
