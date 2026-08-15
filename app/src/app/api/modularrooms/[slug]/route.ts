import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, addBalances, spend } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, currentRound,
  startGame, submitPlay, closeRound, resetGame, payoutFor,
  CARDS, ROOMS, EXTRA_CARD_COST, HIDE_COST,
  type ModularRoomsGame, type RoomId, type Charge,
} from '@/lib/modularRooms'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function chargerFor(seasonSlug: string): Charge {
  return (player, amount) => addBalances(seasonSlug, 'psigems', { [player]: -amount })
}

/** The whole prize list lands once, the first time a finished match is read. */
function settle(game: ModularRoomsGame): void {
  if (game.phase !== 'finished' || game.paidOut) return
  const { psigems, tol, opals } = payoutFor(game)
  if (Object.keys(psigems).length > 0) addBalances(game.seasonSlug, 'psigems', psigems)
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
  const ticked = applyClock(game, getPsigems(game.seasonSlug), chargerFor(game.seasonSlug))
  settle(ticked)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const body = await req.json() as {
    action: string
    players?: string[]
    card?: number; room?: RoomId
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const charge = chargerFor(stored.seasonSlug)
  const balances = getPsigems(stored.seasonSlug)
  const game = applyClock(stored, balances, charge)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: ModularRoomsGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  const round = currentRound(game)

  switch (body.action) {
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      const players = body.players ?? []
      if (players.length < 3) return bad('Нужно хотя бы трое игроков')
      if (!players.every(p => roster.includes(p))) return bad('Все игроки должны быть в сезоне')
      return done(startGame(game, players))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'live') return bad('Матч не идёт')
      return done(closeRound(game, balances, charge))
    }

    case 'play': {
      if (game.phase !== 'live' || !round) return bad('Раунд не идёт')
      if (!game.players.includes(me)) return bad('Вы не в этом матче')
      const card = body.card
      const room = body.room
      if (card == null || !CARDS.includes(card)) return bad('Такой карты нет')
      if (!(game.hands[me] ?? []).includes(card)) return bad('Этой карты у вас не осталось')
      if (!room || !ROOMS.includes(room)) return bad('Выберите комнату')
      return done(submitPlay(game, me, card, room))
    }

    case 'buycard': {
      if (game.phase !== 'live' || !round) return bad('Раунд не идёт')
      if (!game.players.includes(me)) return bad('Вы не в этом матче')
      const card = body.card
      if (card == null || !CARDS.includes(card)) return bad('Такой карты нет')
      if (!spend(game.seasonSlug, me, 'psigems', EXTRA_CARD_COST)) {
        return bad(`Нужно ${EXTRA_CARD_COST} псигемов`)
      }
      game.pending = { ...game.pending, [me]: [...(game.pending[me] ?? []), card] }
      game.log = [...game.log, {
        at: new Date().toISOString(),
        // the purchase is public, but only the card modulo three
        text: `${me} купил дополнительную карту. Её значение по модулю 3: ${((card % 3) + 3) % 3}.`,
        kind: 'buy',
      }]
      return done(game)
    }

    case 'hide': {
      if (game.phase !== 'live' || !round) return bad('Раунд не идёт')
      if (!game.players.includes(me)) return bad('Вы не в этом матче')
      if (round.hidden.includes(me)) return bad('Вы уже оплатили скрытие')
      if (!spend(game.seasonSlug, me, 'psigems', HIDE_COST)) {
        return bad(`Нужно ${HIDE_COST} псигема`)
      }
      round.hidden = [...round.hidden, me]
      game.log = [...game.log, {
        at: new Date().toISOString(),
        text: 'Кто-то оплатил скрытие: в этом раунде объявят только число людей в комнатах.',
        kind: 'buy',
      }]
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
