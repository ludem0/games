import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists,
  startGame, swap, convert, legalConversions, resetGame,
  areNeighbours, edgeKey, SIZE,
  type PathingGame,
} from '@/lib/pathing'

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
    a?: number; b?: number; cell?: number
  }

  const done = (g: PathingGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Роли назначаются до старта')
      const roster = getParticipants(game.seasonSlug)
      if (!body.ec || !body.opponent) return bad('Нужны оба игрока')
      if (body.ec === body.opponent) return bad('Это должны быть разные игроки')
      for (const p of [body.ec, body.opponent]) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      game.ec = body.ec
      game.opponent = body.opponent
      return done(game)
    }

    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (duelists(game).length !== 2) return bad('Сначала назначьте игроков')
      if (game.phase !== 'setup') return bad('Игра уже идёт')
      const first = body.first && duelists(game).includes(body.first) ? body.first : duelists(game)[1]
      game.starter = first
      return done(startGame(game, first))
    }

    case 'swap': {
      if (game.phase !== 'live') return bad('Сейчас не ход')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const { a, b } = body
      if (typeof a !== 'number' || typeof b !== 'number') return bad('Выберите две клетки')
      const size = SIZE * SIZE
      if (a < 0 || b < 0 || a >= size || b >= size) return bad('Клетки вне доски')
      if (!areNeighbours(a, b)) return bad('Клетки должны быть соседними по стороне')
      if (game.edges[edgeKey(a, b)]) return bad('Эта линия уже проведена в этом раунде')
      return done(swap(game, me, a, b))
    }

    case 'convert': {
      if (game.phase !== 'convert') return bad('Сейчас не расплата за раунд')
      if (game.owes !== me) return bad('Клетку отдаёт проигравший вспомогательную доску')
      const cell = body.cell
      if (cell == null || !legalConversions(game, me).includes(cell)) return bad('Эту клетку выбрать нельзя')
      return done(convert(game, me, cell))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
