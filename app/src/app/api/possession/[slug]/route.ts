import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, addBalances } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, currentRound,
  startGame, closeRound, resetGame, payoutFor, drawStone,
  MIN_BET, MAX_BET, MAX_BID, CARDS,
  type PossessionGame, type Charge, type RpsEntry,
} from '@/lib/possession'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function chargerFor(seasonSlug: string): Charge {
  return (player, psigems) => addBalances(seasonSlug, 'psigems', { [player]: psigems })
}

function settle(game: PossessionGame): void {
  if (game.phase !== 'finished' || game.paidOut) return
  const { tol, opals } = payoutFor(game, getPsigems(game.seasonSlug))
  if (Object.keys(tol).length > 0) addBalances(game.seasonSlug, 'tol', tol)
  if (Object.keys(opals).length > 0) addBalances(game.seasonSlug, 'opals', opals)
  game.paidOut = true
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const before = JSON.stringify(game)
  const ticked = applyClock(game, chargerFor(game.seasonSlug))
  settle(ticked)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const charge = chargerFor(stored.seasonSlug)
  const game = applyClock(stored, charge)

  const isAdmin = user.role === 'admin'
  const me = user.username
  const body = await req.json() as {
    action: string
    players?: string[]
    rps?: RpsEntry; card?: number; bid?: number
    identities?: Record<string, string>
    guess?: { possessed: string; hunter: string }
    emptyRound?: number; ignore?: number
  }

  const done = (g: PossessionGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  const round = currentRound(game)
  const playing = game.players.includes(me)
  const entry = round?.submissions[me] ?? {}

  switch (body.action) {
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      const players = body.players ?? []
      if (players.length !== 5) return bad('В этом матче ровно пять игроков')
      if (!players.every(p => roster.includes(p))) return bad('Все игроки должны быть в сезоне')
      return done(startGame(game, players, getPsigems(game.seasonSlug)))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'live') return bad('Матч не идёт')
      return done(closeRound(game, charge))
    }

    case 'submit': {
      if (game.phase !== 'live' || !round || !playing) return bad('Раунд не идёт')
      const next = { ...entry }

      if (body.rps) {
        const { opponent, bet, thrown } = { ...body.rps, thrown: body.rps.throw }
        if (!game.players.includes(opponent) || opponent === me) return bad('Выберите другого игрока')
        if ((game.recentRps[me] ?? []).includes(opponent)) {
          return bad('С этим игроком вы играли в последние два раунда')
        }
        if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
          return bad(`Ставка от ${MIN_BET} до ${MAX_BET}`)
        }
        if (!['rock', 'paper', 'scissors'].includes(thrown)) return bad('Неизвестный жест')
        next.rps = { opponent, bet, throw: thrown }
      }

      if (body.card != null) {
        if (!CARDS.includes(body.card)) return bad('Такой карты нет')
        if (!(game.hands[me] ?? []).includes(body.card)) return bad('Эта карта уже сыграна')
        next.card = body.card
      }

      if (body.bid != null) {
        if (!Number.isInteger(body.bid) || body.bid < 0 || body.bid > MAX_BID) {
          return bad(`Ставка в торгах от 0 до ${MAX_BID}`)
        }
        next.bid = body.bid
      }

      if (body.identities) next.identities = body.identities
      if (body.guess) next.guess = body.guess
      if (body.emptyRound != null) next.emptyRound = body.emptyRound

      round.submissions = { ...round.submissions, [me]: next }
      return done(game)
    }

    case 'draw': {
      if (game.phase !== 'live' || !round || !playing) return bad('Раунд не идёт')
      const stones = entry.stones ?? []
      if (stones.includes('red')) return bad('Красный камень остановил вашу добычу')
      if (stones.length >= 15) return bad('Мешок пуст')
      const stone = drawStone(stones)
      round.submissions = { ...round.submissions, [me]: { ...entry, stones: [...stones, stone] } }
      return done(game)
    }

    case 'ignore': {
      if (game.phase !== 'live' || !round || !playing) return bad('Раунд не идёт')
      if (round.roles.possessed !== me) return bad('Игнорировать камень может только одержимый')
      const index = body.ignore
      const stones = entry.stones ?? []
      if (index == null || index < 0 || index >= stones.length) return bad('Такого камня нет')
      round.submissions = { ...round.submissions, [me]: { ...entry, ignored: index } }
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
