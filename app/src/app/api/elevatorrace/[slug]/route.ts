import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, addBalances, spend } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, currentTurn, racing,
  start, submitRoll, submitClaim, submitChallenge, closeRollPhase, resolveTurn,
  buyLife, payoutFor, resetGame, rowOf,
  ROLLERS, FINISH, LIFE_COST,
  type ElevatorRaceGame, type Charge, type RollerKind, type RollValue,
} from '@/lib/elevatorRace'

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

/** Prizes land once, the first time a finished race is looked at. */
function settle(game: ElevatorRaceGame): void {
  if (game.phase !== 'finished' || game.paidOut) return
  const { psigems, clearOpals } = payoutFor(game)
  if (Object.keys(psigems).length > 0) addBalances(game.seasonSlug, 'psigems', psigems)
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
  const ticked = applyClock(game, chargerFor(game.seasonSlug))
  settle(ticked)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username))
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
    roller?: RollerKind; claim?: RollValue; target?: string
    elevators?: { from: number; to: number }[]
  }

  const done = (g: ElevatorRaceGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  const turn = currentTurn(game)

  switch (body.action) {
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Гонка уже идёт')
      const roster = getParticipants(game.seasonSlug)
      if (roster.length < 3) return bad('Нужно хотя бы три участника')
      return done(start(game, roster))
    }

    case 'elevators': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Лифты правятся до старта')
      const list = body.elevators ?? []
      const valid = list.every(e =>
        Number.isInteger(e.from) && Number.isInteger(e.to) &&
        e.from >= 1 && e.from < FINISH && e.to >= 1 && e.to < FINISH &&
        rowOf(e.from) !== rowOf(e.to))
      if (!valid) return bad('Лифт ведёт с клетки 1-64 на другую клетку в другом ряду')
      game.elevators = list
      return done(game)
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (!turn || turn.closedAt) return bad('Ход не идёт')
      return done(turn.phase === 'roll' ? closeRollPhase(game, charge) : resolveTurn(game, charge))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    // ---- the roll phase ----
    case 'roll': {
      if (game.phase !== 'roll' || !turn) return bad('Сейчас не фаза броска')
      if (!racing(game).includes(me)) return bad('Вы не в гонке')
      if (turn.entries[me]?.roller) return bad('Вы уже бросали в этом ходу')
      const roller = body.roller
      if (!roller || !ROLLERS.includes(roller)) return bad('Неизвестный роллер')
      if (!game.players[me].hand.includes(roller)) return bad('Этот роллер уже сброшен')
      submitRoll(game, me, roller, charge)
      return done(game)
    }

    case 'claim': {
      if (game.phase !== 'roll' || !turn) return bad('Заявку подают в фазе броска')
      if (!racing(game).includes(me)) return bad('Вы не в гонке')
      if (!turn.entries[me]?.roller) return bad('Сначала бросьте роллер')
      const claim = body.claim
      const legal = claim === 'bust' || (typeof claim === 'number' && Number.isInteger(claim) && claim >= 0 && claim <= 8)
      if (!legal) return bad('Заявить можно число от 0 до 8 или bust')
      return done(submitClaim(game, me, claim as RollValue))
    }

    // ---- the bluff phase ----
    case 'challenge': {
      if (game.phase !== 'bluff' || !turn) return bad('Сейчас не фаза блефа')
      if (!racing(game).includes(me)) return bad('Финишировавшие не вызывают')
      const target = body.target ?? ''
      if (target === me) return bad('Себя вызывать нельзя')
      if (!racing(game).includes(target)) return bad('Этого игрока нет в гонке')
      if (turn.entries[me]?.challenge) return bad('Вызов уже сделан')
      return done(submitChallenge(game, me, target))
    }

    case 'buylife': {
      if (!racing(game).includes(me)) return bad('Вы не в гонке')
      if (game.players[me].lives >= 3) return bad('Больше трёх жизней не бывает')
      if (!spend(game.seasonSlug, me, 'psigems', LIFE_COST)) return bad(`Нужно ${LIFE_COST} псигемов`)
      return done(buyLife(game, me))
    }

    default:
      return bad('Неизвестное действие')
  }
}
