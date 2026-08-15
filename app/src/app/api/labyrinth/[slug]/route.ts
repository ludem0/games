import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, addBalances } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, resetGame, setPlayers,
  bidStart, resolveStart, bidOrder, resolveOrder, doShove, doMove, chooseEc,
  SEATS, MAX_BID,
  type LabyrinthGame, type Field, type Grant,
} from '@/lib/labyrinth'
import { COLOURS, ORIENTS, gateById, type Colour, type Orient } from '@/lib/labyrinthBoard'

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
    players?: string[]; tiebreak?: string[]
    bid?: number; prefs?: Colour[]; target?: string
    gate?: number; orient?: Orient; to?: number
  }

  const grant: Grant = (field: Field, deltas) => addBalances(game.seasonSlug, field, deltas)

  const done = (g: LabyrinthGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    case 'players': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Игроков назначают до аукциона')
      const players = body.players ?? []
      if (players.length !== SEATS) return bad(`Нужно ровно ${SEATS} игрока`)
      if (new Set(players).size !== SEATS) return bad('Игроки должны быть разными')
      const roster = getParticipants(game.seasonSlug)
      for (const p of players) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      return done(setPlayers(game, players, body.tiebreak ?? players))
    }

    case 'bidStart': {
      if (game.phase !== 'bid_start') return bad('Аукцион за угол уже закрыт')
      if (!game.players.includes(me)) return bad('Вы не играете в этом матче')
      const bid = body.bid
      if (bid == null || !Number.isInteger(bid) || bid < 0 || bid > MAX_BID) {
        return bad(`Ставка от 0 до ${MAX_BID}`)
      }
      const prefs = body.prefs ?? []
      if (prefs.length !== COLOURS.length || new Set(prefs).size !== COLOURS.length) {
        return bad('Укажите все четыре цвета по порядку')
      }
      if (prefs.some(c => !COLOURS.includes(c))) return bad('Неизвестный цвет')

      const next = bidStart(game, me, bid, prefs)
      if (Object.keys(next.startBids).length === SEATS) resolveStart(next, grant)
      return done(next)
    }

    case 'bidOrder': {
      if (game.phase !== 'bid_order') return bad('Аукцион за порядок уже закрыт')
      if (!game.players.includes(me)) return bad('Вы не играете в этом матче')
      const bid = body.bid
      if (bid == null || !Number.isInteger(bid) || bid < 0 || bid > MAX_BID) {
        return bad(`Ставка от 0 до ${MAX_BID}`)
      }
      if (!body.target || !game.players.includes(body.target)) return bad('Выберите, кто ходит первым')

      const next = bidOrder(game, me, bid, body.target)
      if (Object.keys(next.orderBids).length === SEATS) resolveOrder(next, grant)
      return done(next)
    }

    case 'shove': {
      const gate = body.gate
      const orient = body.orient
      if (gate == null || !gateById(gate)) return bad('Такого входа нет')
      if (!orient || !ORIENTS.includes(orient)) return bad('Неизвестная фишка')
      const result = doShove(game, me, gate, orient)
      if (result.problem) return bad(result.problem)
      return done(game)
    }

    case 'move': {
      const to = body.to
      if (to == null || !Number.isInteger(to) || to < 0 || to >= 49) return bad('Клетка вне доски')
      const result = doMove(game, me, to, grant)
      if (result.problem) return bad(result.problem)
      return done(game)
    }

    case 'ec': {
      if (!body.target) return bad('Выберите игрока')
      const result = chooseEc(game, me, body.target)
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
