import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, addBalances } from '@/lib/seasons'
import {
  getGame, saveGame, viewFor, currentRound, startGame, closeRound, claimSpirit,
  attemptBalance, finish, payoutFor, resetGame, weigh, ownedTotems,
  wolfLegal, foxLegal, TOTEM_COUNT, SCALE_USES, MIN_BID, MAX_BID_SERIES, MAX_BID_ROUND,
  type TotemicGame, type Charge, type Series, type Wager,
} from '@/lib/totemic'

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

function settle(game: TotemicGame): void {
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
  return NextResponse.json(viewFor(game, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const isAdmin = user.role === 'admin'
  const me = user.username
  const charge = chargerFor(game.seasonSlug)
  const body = await req.json() as {
    action: string
    players?: string[]
    series?: { a: Series; b: Series }
    hints?: Record<string, string>
    bid?: { series: 'a' | 'b'; amount: number; order: (number | 'garnet')[] }
    wager?: { kind: Wager; totems: number[]; letter?: string; fine?: boolean }
    left?: number[]; right?: number[]
    totem?: number
    sides?: { totems: number[]; balloons: string[] }[]
    guesses?: Record<string, number>
  }

  const done = (g: TotemicGame) => {
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
      if (players.length < 3) return bad('Нужно хотя бы трое')
      if (!players.every(p => roster.includes(p))) return bad('Все игроки должны быть в сезоне')
      if (!body.series) return bad('Задайте состав серий на первый раунд')
      return done(startGame(game, players, getPsigems(game.seasonSlug), body.series, body.hints ?? {}))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'auction') return bad('Аукцион не идёт')
      return done(closeRound(game, charge, body.series ?? null))
    }

    case 'bid': {
      if (game.phase !== 'auction' || !round || !seat) return bad('Аукцион не идёт')
      const bid = body.bid
      if (!bid || (bid.series !== 'a' && bid.series !== 'b')) return bad('Укажите серию')
      if (!Number.isInteger(bid.amount) || bid.amount < MIN_BID || bid.amount > MAX_BID_SERIES) {
        return bad(`Ставка от ${MIN_BID} до ${MAX_BID_SERIES}`)
      }
      const other = round.bids[me]?.[bid.series === 'a' ? 'b' : 'a']?.amount ?? 0
      if (bid.amount + other > MAX_BID_ROUND) return bad(`За раунд нельзя ставить больше ${MAX_BID_ROUND}`)
      if (bid.amount > seat.chips) return bad('Столько фишек у вас нет')
      round.bids = {
        ...round.bids,
        [me]: { ...round.bids[me], [bid.series]: { amount: bid.amount, order: bid.order ?? [] } },
      }
      return done(game)
    }

    case 'wager': {
      if (game.phase !== 'auction' || !round || !seat) return bad('Аукцион не идёт')
      const wager = body.wager
      if (!wager) return bad('Выберите ставку удачи')
      if (wager.kind === 'snake' && seat.snakeUsed >= 2) return bad('Змея доступна только дважды')
      if (wager.kind === 'wolf') {
        const problem = wolfLegal(game, seat, wager.totems)
        if (problem) return bad(problem)
      }
      if (wager.kind === 'fox') {
        const problem = foxLegal(game, wager.totems)
        if (problem) return bad(problem)
      }
      if (wager.kind === 'bear' && wager.totems.length === 0) return bad('Выберите тотемы')
      round.wagers = { ...round.wagers, [me]: wager }
      return done(game)
    }

    case 'weigh': {
      if (!round || !seat) return bad('Раунд не идёт')
      const used = round.weighings[me]?.length ?? 0
      if (used >= SCALE_USES) return bad(`За раунд можно взвешивать ${SCALE_USES} раза`)
      const left = body.left ?? []
      const right = body.right ?? []
      if (left.length === 0 && right.length === 0) return bad('Положите что-нибудь на весы')
      const mine = ownedTotems(seat)
      if (![...left, ...right].every(id => mine.includes(id))) return bad('Это не ваши тотемы')
      const result = weigh(game, left, right)
      round.weighings = {
        ...round.weighings,
        [me]: [...(round.weighings[me] ?? []), { left, right, result }],
      }
      return done(game)
    }

    case 'claimspirit': {
      if (game.owedSpirit !== me) return bad('Вам сейчас не положен выбор из запаса')
      if (body.totem == null) return bad('Выберите тотем')
      return done(claimSpirit(game, me, body.totem))
    }

    case 'balance': {
      if (game.phase !== 'final' || !seat) return bad('Финальное испытание ещё не началось')
      const sides = body.sides ?? []
      const result = attemptBalance(game, me, sides)
      saveGame(game)
      return NextResponse.json({ ...viewFor(game, me, isAdmin), problem: result.problem })
    }

    case 'guess': {
      if (!seat) return bad('Вы не в матче')
      const guesses = body.guesses ?? {}
      for (const totem of Object.values(guesses)) {
        if (!Number.isInteger(totem) || totem < 0 || totem >= TOTEM_COUNT) return bad('Такого тотема нет')
      }
      game.guesses = { ...game.guesses, [me]: guesses }
      return done(game)
    }

    case 'finish': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'final') return bad('Ещё идёт аукцион')
      return done(finish(game, getPsigems(game.seasonSlug)))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
