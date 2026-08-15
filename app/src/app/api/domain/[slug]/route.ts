import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, resetGame, duelists,
  setRoles, startDraft, draftPick, place, autoDraft,
  type DomainGame,
} from '@/lib/domain'
import { BOARD_H, BOARD_W } from '@/lib/domainShapes'
import { testToolsOn } from '@/lib/testTools'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const before = JSON.stringify(game)
  const ticked = applyClock(game)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username
  const body = await req.json() as {
    action: string
    ec?: string; opponent?: string; first?: string
    shapeId?: number; x?: number; y?: number; rot?: number
  }

  const done = (g: DomainGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Игроки назначаются до старта')
      if (!body.ec || !body.opponent) return bad('Нужны оба игрока')
      if (body.ec === body.opponent) return bad('Это должны быть разные игроки')
      const roster = getParticipants(game.seasonSlug)
      for (const p of [body.ec, body.opponent]) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      return done(setRoles(game, body.ec, body.opponent))
    }

    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Разбор уже начат')
      if (duelists(game).length !== 2) return bad('Сначала назначьте игроков')
      // the organiser decides who opens the draft
      const first = body.first && duelists(game).includes(body.first) ? body.first : duelists(game)[0]
      return done(startDraft(game, first))
    }

    case 'draft': {
      if (body.shapeId == null) return bad('Выберите фигуру')
      const result = draftPick(game, me, body.shapeId)
      if (result.problem) return bad(result.problem)
      return done(game)
    }

    case 'place': {
      const { shapeId, x, y, rot } = body
      if (shapeId == null) return bad('Выберите фигуру')
      if (x == null || y == null || rot == null) return bad('Не хватает координат')
      if (![x, y, rot].every(Number.isFinite)) return bad('Координаты испорчены')
      if (x < 0 || x > BOARD_W || y < 0 || y > BOARD_H) return bad('Точка вне доски')
      const result = place(game, me, shapeId, Math.round(x), Math.round(y), Math.round(rot))
      if (result.problem) return bad(result.problem)
      return done(game)
    }

    case 'autoDraft': {
      if (!isAdmin || !testToolsOn()) return bad('Forbidden', 403)
      const result = autoDraft(game)
      if (result.problem) return bad(result.problem)
      return done(game)
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
