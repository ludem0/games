import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, addBalances, spend } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, currentRound, neighboursOf,
  startGame, closeRound, resetGame, payoutFor, vertexName, RPS,
  LOCATION_COST, RANDOM_RPS_COST,
  type TheCubeGame, type Rps,
} from '@/lib/theCube'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function settle(game: TheCubeGame): void {
  if (game.phase !== 'finished' || game.paidOut) return
  const { psigems, tol, opals, clearOpals } = payoutFor(game)
  if (Object.keys(psigems).length > 0) addBalances(game.seasonSlug, 'psigems', psigems)
  if (Object.keys(tol).length > 0) addBalances(game.seasonSlug, 'tol', tol)
  if (Object.keys(opals).length > 0) addBalances(game.seasonSlug, 'opals', opals)
  if (Object.keys(clearOpals).length > 0) addBalances(game.seasonSlug, 'clearOpals', clearOpals)
  game.paidOut = true
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const before = JSON.stringify(game)
  const ticked = applyClock(game)
  settle(ticked)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const body = await req.json() as {
    action: string
    players?: string[]
    to?: number; rps?: Rps | null
    partner?: string; give?: number; take?: number
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: TheCubeGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  const round = currentRound(game)
  const seat = game.seats[me]

  switch (body.action) {
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      const players = body.players ?? []
      if (players.length < 2 || players.length > 8) return bad('На кубе от двух до восьми человек')
      if (!players.every(p => roster.includes(p))) return bad('Все игроки должны быть в сезоне')
      return done(startGame(game, players))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'live') return bad('Матч не идёт')
      return done(closeRound(game))
    }

    case 'move': {
      if (game.phase !== 'live' || !round || !seat) return bad('Раунд не идёт')
      const to = body.to
      if (to == null || !neighboursOf(seat.at).some(n => n.vertex === to)) {
        return bad('Туда с вашей вершины ребра нет')
      }
      const card = body.rps ?? null
      if (card && !RPS.includes(card)) return bad('Неизвестная карта')
      if (card && !seat.rps.includes(card)) return bad('Такой карты у вас нет')
      round.moves = { ...round.moves, [me]: { to, rps: card } }
      return done(game)
    }

    case 'trade': {
      if (game.phase !== 'live' || !round || !seat) return bad('Раунд не идёт')
      const { partner, give, take } = body
      if (!partner || !game.seats[partner]) return bad('Такого игрока нет')
      if (game.seats[partner].at !== seat.at) return bad('Меняться можно только стоя на одной вершине')
      if (give == null || take == null) return bad('Укажите, что отдаёте и что берёте')
      if (!seat.cards.includes(give)) return bad('Этой карты у вас нет')
      round.trades = { ...round.trades, [me]: { partner, give, take } }
      return done(game)
    }

    case 'scan': {
      if (game.phase !== 'live' || !seat) return bad('Матч не идёт')
      if (!spend(game.seasonSlug, me, 'psigems', LOCATION_COST)) return bad('Нужен 1 псигем')
      const places = game.players
        .map(p => `${p}: ${vertexName(game.seats[p].at)}`)
        .join(' · ')
      return NextResponse.json({ ...viewFor(game, me, isAdmin), scan: places })
    }

    case 'randomrps': {
      if (game.phase !== 'live' || !round || !seat) return bad('Раунд не идёт')
      if (!round.moves[me]) return bad('Сначала выберите ребро')
      if (seat.rps.length === 0) return bad('Карт RPS не осталось')
      if (!spend(game.seasonSlug, me, 'psigems', RANDOM_RPS_COST)) {
        return bad(`Нужно ${RANDOM_RPS_COST} псигемов`)
      }
      // the card stays a mystery to its owner until the deadline
      const pick = seat.rps[Math.floor(Math.random() * seat.rps.length)]
      round.moves = { ...round.moves, [me]: { ...round.moves[me], rps: pick } }
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
