import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, pieceAt, movesFor,
  placeArmy, validateLayout, startGame, move, tiebreakPick, resetGame,
  sideOf, movablePieces,
  type FieldTacticsGame,
} from '@/lib/fieldTactics'

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

  const body = await req.json() as {
    action: string
    ec?: string; opponent?: string; first?: string
    layout?: Record<string, number>
    from?: number; to?: number; pieceId?: string
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: FieldTacticsGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Игроки назначаются до расстановки')
      const roster = getParticipants(game.seasonSlug)
      if (!body.ec || !body.opponent) return bad('Нужны оба игрока')
      if (body.ec === body.opponent) return bad('Это должны быть разные игроки')
      for (const p of [body.ec, body.opponent]) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      game.ec = body.ec
      game.opponent = body.opponent
      // the elimination candidate takes blue, the opponent red, as printed
      game.sides = { [body.opponent]: 'red', [body.ec]: 'blue' }
      game.phase = 'placing'
      return done(game)
    }

    case 'place': {
      if (game.phase !== 'placing') return bad('Расстановка уже закончена')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.placed[me]) return bad('Вы уже расставили армию')
      const layout = body.layout ?? {}
      const problem = validateLayout(sideOf(game, me), layout)
      if (problem) return bad(problem)
      return done(placeArmy(game, me, layout))
    }

    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'placing') return bad('Сейчас не расстановка')
      if (!duelists(game).every(p => game.placed[p])) return bad('Ждём вторую расстановку')
      const first = body.first && duelists(game).includes(body.first) ? body.first : duelists(game)[1]
      return done(startGame(game, first))
    }

    case 'move': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const { from, to } = body
      if (typeof from !== 'number' || typeof to !== 'number') return bad('Укажите откуда и куда')
      const piece = pieceAt(game, from)
      if (!piece || piece.side !== sideOf(game, me)) return bad('Это не ваша фигура')
      if (!movesFor(game, piece).includes(to)) return bad('Так эта фигура не ходит')
      return done(move(game, me, from, to))
    }

    case 'duel': {
      if (game.phase !== 'tiebreak') return bad('Дуэль не идёт')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.tiebreakPicks[me]) return bad('Вы уже выбрали фигуру')
      const piece = game.pieces.find(p => p.id === body.pieceId)
      if (!piece || !piece.alive || piece.side !== sideOf(game, me)) return bad('Выберите свою живую фигуру')
      if (!movablePieces(game, sideOf(game, me)).some(p => p.id === piece.id)) {
        return bad('В дуэль идут только подвижные фигуры')
      }
      // the advantage settles a duel where everything ties, and that is the opponent
      return done(tiebreakPick(game, me, piece.id, game.opponent))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
