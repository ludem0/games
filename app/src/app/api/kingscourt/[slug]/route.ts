import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getBalance, addBalances, spend } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, currentAttempt, currentRound,
  startAttempt, closeRound, breakTie, castVote, submitCheck, kingPeek,
  paidPeek, annoyedCheck, payoutFor, setEc, ecCandidates, resetGame,
  players, voters, membersOf,
  PEEK_COST, ANNOYED_COST, MAX_ATTEMPTS,
  type KingsCourtGame, type Charge,
} from '@/lib/kingsCourt'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** Penalties the game hands out go straight into the season. */
function chargerFor(seasonSlug: string): Charge {
  return (player, amount) => addBalances(seasonSlug, 'psigems', { [player]: -amount })
}

/** Rewards land once, the first time a finished game is looked at. */
function settle(game: KingsCourtGame): void {
  const attempt = currentAttempt(game)
  if (!attempt?.winner || attempt.paidOut) return
  const { psigems, tol } = payoutFor(attempt)
  if (Object.keys(psigems).length > 0) addBalances(game.seasonSlug, 'psigems', psigems)
  if (Object.keys(tol).length > 0) addBalances(game.seasonSlug, 'tol', tol)
  attempt.paidOut = true
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

  const body = await req.json() as {
    action: string
    target?: string; names?: string[]; pair?: string[]; duke?: string; noble?: string
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const charge = chargerFor(stored.seasonSlug)
  const game = applyClock(stored, charge)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: KingsCourtGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  const attempt = currentAttempt(game)
  const round = currentRound(attempt)

  switch (body.action) {
    // ---- the host runs the match ----
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      if (roster.length < 3) return bad('Нужно хотя бы три участника')
      return done(startAttempt(game, roster))
    }

    case 'nextattempt': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (!attempt?.earlyEnd) return bad('Текущая игра ещё идёт')
      if (game.attempts.length >= MAX_ATTEMPTS) return bad('Все четыре игры сыграны')
      return done(startAttempt(game, players(attempt)))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'live' || !round || round.closedAt) return bad('Раунд не идёт')
      return done(closeRound(game, charge))
    }

    case 'setec': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'payout') return bad('Матч ещё не сыгран')
      if (!attempt) return bad('Нет игры')
      const candidates = ecCandidates(attempt).map(c => c.player)
      if (!body.target || !candidates.includes(body.target)) return bad('Это не кандидат')
      return done(setEc(game, body.target))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    // ---- the king ----
    case 'kingpeek': {
      if (!attempt || attempt.king !== me) return bad('Forbidden', 403)
      if (attempt.court.length > 0) return bad('Смотреть можно только до первого избрания')
      if (attempt.kingPeeks.length > 0) return bad('Вы уже посмотрели')
      const names = [...new Set(body.names ?? [])]
      if (names.length !== 2) return bad('Выберите двух игроков')
      if (names.includes(me)) return bad('Себя смотреть незачем')
      if (!names.every(n => players(attempt).includes(n))) return bad('Такого игрока нет')
      return done(kingPeek(game, names))
    }

    case 'tiebreak': {
      if (!attempt || attempt.king !== me) return bad('Forbidden', 403)
      if (game.phase !== 'tiebreak' || !round) return bad('Сейчас нет ничьей')
      const choice = body.target ?? ''
      if (!round.tiedAmong.includes(choice)) return bad('Выберите из тех, у кого поровну голосов')
      if (choice === me) return bad('Себя выбирать нельзя')
      return done(breakTie(game, choice, charge))
    }

    case 'givetol': {
      if (!attempt || attempt.king !== me) return bad('Forbidden', 403)
      if (attempt.winner !== 'king') return bad('Жетоны раздаёт только победивший король')
      const { duke, noble } = body
      if (!duke || !noble) return bad('Нужны герцог и дворянин')
      if (!membersOf(attempt, 'duke').includes(duke)) return bad(`${duke} не герцог`)
      if (!membersOf(attempt, 'noble').includes(noble)) return bad(`${noble} не дворянин`)
      if ((getBalance(game.seasonSlug, 'tol')[me] ?? 0) < 2) return bad('У вас нет двух жетонов')
      addBalances(game.seasonSlug, 'tol', { [me]: -2, [duke]: 1, [noble]: 1 })
      return done(game)
    }

    // ---- everyone ----
    case 'vote': {
      if (game.phase !== 'live' || !attempt || !round) return bad('Голосование не идёт')
      if (!voters(attempt).includes(me)) return bad('Члены суда не голосуют')
      const target = body.target ?? ''
      if (target === me) return bad('За себя голосовать нельзя')
      if (!voters(attempt).includes(target)) return bad('Этот игрок уже в суде')
      return done(castVote(game, me, target))
    }

    case 'check': {
      if (!attempt || !round) return bad('Игра не идёт')
      if (round.checkBy !== me) return bad('Проверку заказывает вошедший в суд')
      if (round.checkPair) return bad('Вы уже назвали пару')
      const pair = [...new Set(body.pair ?? [])]
      if (pair.length !== 2) return bad('Назовите двух игроков')
      if (pair.includes(me)) return bad('Себя включать нельзя')
      if (!pair.every(p => players(attempt).includes(p))) return bad('Такого игрока нет')
      return done(submitCheck(game, me, pair))
    }

    case 'peek': {
      if (!attempt || !players(attempt).includes(me)) return bad('Forbidden', 403)
      if (game.phase !== 'live' && game.phase !== 'tiebreak') return bad('Матч не идёт')
      const target = body.target ?? ''
      if (!players(attempt).includes(target) || target === me) return bad('Выберите другого игрока')
      if (!spend(game.seasonSlug, me, 'psigems', PEEK_COST)) return bad(`Нужно ${PEEK_COST} псигемов`)
      return done(paidPeek(game, me, target))
    }

    case 'annoyed': {
      if (!attempt || !players(attempt).includes(me)) return bad('Forbidden', 403)
      if (game.phase !== 'live' && game.phase !== 'tiebreak') return bad('Матч не идёт')
      if (!spend(game.seasonSlug, me, 'psigems', ANNOYED_COST)) return bad(`Нужно ${ANNOYED_COST} псигема`)
      return done(annoyedCheck(game, me))
    }

    default:
      return bad('Неизвестное действие')
  }
}
