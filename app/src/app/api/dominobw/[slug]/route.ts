import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists,
  startGame, place, resetGame, canPlace, fullSet,
  COLUMNS, ROWS,
  type DominoBwGame,
} from '@/lib/dominoBw'

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

  return NextResponse.json(viewFor(ticked, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const body = await req.json() as {
    action: string
    ec?: string; opponent?: string; first?: string
    domino?: string; col?: number; row?: number
    vertical?: boolean; swapped?: boolean; hideSecond?: boolean
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: DominoBwGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Игроки назначаются до старта')
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
      return done(startGame(game, first))
    }

    case 'place': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.turn !== me) return bad('Сейчас не ваш ход')

      const { domino, col, row } = body
      const vertical = !!body.vertical
      if (!domino || !fullSet().some(d => d.id === domino)) return bad('Такого домино нет')
      if (!(game.hands[me] ?? []).includes(domino)) return bad('Это домино уже сыграно')
      if (typeof col !== 'number' || typeof row !== 'number') return bad('Выберите клетку')
      if (col < 0 || col >= COLUMNS || row < 0 || row >= ROWS) return bad('Клетка вне доски')
      if (!canPlace(game.cells, col, row, vertical)) return bad('Сюда домино не встанет')

      return done(place(game, me, domino, col, row, vertical, !!body.swapped, !!body.hideSecond))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
