import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { getMinigame, saveMinigame, deleteMinigame } from '@/lib/minigames'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (user.role !== 'admin') {
    // Strip future round layouts from player view
    const filtered = {
      ...game,
      rounds: game.rounds.map(r => ({
        ...r,
        layout: r.phase === 'pending' ? { tracks: [], switches: [], peekUnlocked: r.layout.peekUnlocked } : r.layout,
        submissions: r.submissions.filter(s => s.username === user.username),
      })),
    }
    return NextResponse.json(filtered)
  }

  return NextResponse.json(game)
}

export async function PUT(req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const game = getMinigame(slug)
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = { ...game }
  if (body.name) updated.name = body.name
  if (body.status) updated.status = body.status
  if (body.participants) {
    updated.participants = body.participants
    for (const p of body.participants) {
      if (!(p in updated.totalPoints)) updated.totalPoints[p] = 0
      if (!(p in updated.psigemBalance)) updated.psigemBalance[p] = 0
    }
  }

  saveMinigame(slug, updated)
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: Params) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifyToken(token)
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  deleteMinigame(slug)
  return NextResponse.json({ ok: true })
}
