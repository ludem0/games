import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getMatches, saveMatches, getParticipants } from '@/lib/seasons'
import type { Match } from '@/lib/seasons'
import {
  createSeasonGame, seasonGameSlug, syncParticipants, getMinigame, saveMinigame,
} from '@/lib/minigames'
import { createGame as createLetterbox } from '@/lib/letterbox'

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

  let matches = getMatches(slug)

  // main matches made before games moved into seasons have no game yet: give them one
  if (user.role === 'admin' && matches.some(m => m.type === 'main' && !m.minigameSlug)) {
    matches = matches.map(m =>
      m.type === 'main' && !m.minigameSlug ? { ...m, minigameSlug: seasonGameSlug(slug, m.id) } : m)
    saveMatches(slug, matches)
    for (const m of matches) {
      if (m.type === 'main' && m.minigameSlug) {
        createSeasonGame(m.minigameSlug, slug, m.name, getParticipants(slug))
      }
    }
  }

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

  const type: 'main' | 'death' = body.type ?? 'main'
  const id = `m${Date.now()}`
  const sameType = matches.filter(m => m.type === type).length + 1
  const defaultName = type === 'main' ? `MM${sameType}: Track Trouble` : `DM${sameType}: Letterbox`

  const newMatch: Match = {
    id,
    type,
    name: body.name ?? defaultName,
    visible: body.visible ?? true,
    accessible: body.accessible ?? false,
    // every main match is a game of its own, so it is created right here and the
    // slug comes from the season and the match instead of being typed by hand
    minigameSlug: seasonGameSlug(slug, id),
  }

  // a main match is a game of Track Trouble, a death match is a game of Letterbox
  if (type === 'main') {
    createSeasonGame(seasonGameSlug(slug, id), slug, newMatch.name, getParticipants(slug))
  } else {
    createLetterbox(seasonGameSlug(slug, id), slug, newMatch.name, id)
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

  // a renamed main match renames its game, and the roster always follows the season
  const match = updated.find(m => m.id === body.id)
  if (match?.type === 'main' && match.minigameSlug) {
    const game = getMinigame(match.minigameSlug)
    if (game) saveMinigame(match.minigameSlug, { ...game, name: match.name })
    syncParticipants(match.minigameSlug, getParticipants(slug))
  }
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
