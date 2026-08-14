import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, legalModules,
  startGame, takeTurn, resetGame,
  MODULES, MAX_CARDS_PER_TURN, MAX_CARDS_ON_PATH,
  type TugOfWarGame, type ModuleId,
} from '@/lib/tugOfWar'

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
    module?: ModuleId; cards?: number[]; option?: string; tiles?: number[]; block?: ModuleId
  }

  const done = (g: TugOfWarGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
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
      // the advantage picks who opens, and the host enters that choice
      const first = body.first && duelists(game).includes(body.first) ? body.first : duelists(game)[1]
      return done(startGame(game, first))
    }

    case 'turn': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const module = body.module
      if (!module || !MODULES.includes(module)) return bad('Такого модуля нет')
      if (!legalModules(game, me).includes(module)) return bad('На этом модуле сейчас играть нельзя')

      const cards = body.cards ?? []
      const limit = module === 'path' ? MAX_CARDS_ON_PATH : MAX_CARDS_PER_TURN
      if (cards.length === 0) return bad('Нужно сыграть хотя бы одну карту')
      if (cards.length > limit) return bad(`На этом модуле не больше ${limit} карт за ход`)

      const hand = [...(game.hands[me] ?? [])]
      for (const card of cards) {
        const index = hand.indexOf(card)
        if (index < 0) return bad(`Карты силой ${card} у вас нет`)
        hand.splice(index, 1)
      }
      if (module === 'path' && (body.tiles ?? []).length === 0) {
        return bad('Укажите клетки, которые перекрашиваете')
      }
      if (body.block && !MODULES.includes(body.block)) return bad('Такого модуля нет')

      return done(takeTurn(game, me, {
        module,
        cards,
        option: body.option,
        tiles: body.tiles,
        block: body.block,
      }))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
