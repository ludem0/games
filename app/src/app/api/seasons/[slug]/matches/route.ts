import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getMatches, saveMatches } from '@/lib/seasons'
import type { Match } from '@/lib/seasons'

async function getRole() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  const user = await verifyToken(token)
  return user ?? null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const matches = getMatches(slug)
  const visible = user.role === 'admin'
    ? matches
    : matches.map(m => ({ ...m, name: m.visible ? m.name : '???' }))

  return NextResponse.json({ matches: visible })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const matches = getMatches(slug)

  const newMatch: Match = {
    id: `m${Date.now()}`,
    type: body.type ?? 'main',
    name: body.name ?? 'Новый матч',
    visible: body.visible ?? true,
    accessible: body.accessible ?? false,
    minigameSlug: body.minigameSlug,
  }

  saveMatches(slug, [...matches, newMatch])
  return NextResponse.json({ matches: getMatches(slug) })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const matches = getMatches(slug)
  const updated = matches.map(m => m.id === body.id ? { ...m, ...body } : m)
  saveMatches(slug, updated)
  return NextResponse.json({ matches: getMatches(slug) })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const matches = getMatches(slug).filter(m => m.id !== id)
  saveMatches(slug, matches)
  return NextResponse.json({ matches: getMatches(slug) })
}
