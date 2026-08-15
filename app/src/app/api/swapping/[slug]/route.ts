import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, currentRound,
  startRound, submitPlay, submitSwap, resetGame,
  tilesInHand, hiddenPositions, canSwap, isBlack,
  MAX_GAMES, type SwappingGame,
} from '@/lib/swapping'

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
    ec?: string; opponent?: string
    tiles?: number[]; pair?: number[]; position?: number
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: SwappingGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Роли назначаются до начала серии')
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
      if (duelists(game).length !== 2) return bad('Сначала назначьте роли')
      if (game.phase !== 'setup') return bad('Серия уже идёт')
      return done(startRound(game))
    }

    case 'nextgame': {
      if (!isAdmin) return bad('Forbidden', 403)
      const round = currentRound(game)
      if (game.phase === 'finished') return bad('Матч закончен')
      if (!round?.finishedAt) return bad('Текущая игра ещё не закончена')
      if (game.rounds.length >= MAX_GAMES) return bad('Сыграны все три игры')
      return done(startRound(game))
    }

    // ---- the play phase: three tiles at a time ----
    case 'play': {
      if (game.phase !== 'play') return bad('Сейчас не фаза выкладки')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      const round = currentRound(game)
      if (!round || round.finishedAt) return bad('Игра закончена')
      if (round.submitted[me] != null) return bad('Вы уже выложили эту тройку')

      const tiles = body.tiles ?? []
      if (tiles.length !== 3) return bad('Нужно ровно три плитки')
      if (new Set(tiles).size !== 3) return bad('Плитки должны быть разными')
      const hand = tilesInHand(round, me)
      if (!tiles.every(t => hand.includes(t))) return bad('Этих плиток у вас уже нет')
      return done(submitPlay(game, me, tiles))
    }

    // ---- the swap phase: a pair, then a reveal ----
    case 'swap': {
      if (game.phase !== 'swap') return bad('Сейчас не фаза обмена')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      const round = currentRound(game)
      if (!round || round.finishedAt) return bad('Игра закончена')
      if (round.swapStep !== 'swap') return bad('Сейчас открывают плитку, а не меняют')
      if (round.submitted[me] != null) return bad('Вы уже сделали обмен')
      if (!canSwap(round, me)) return bad('Менять нечего: остался один цвет')

      const pair = body.pair ?? []
      if (pair.length !== 2 || pair[0] === pair[1]) return bad('Выберите две разные позиции')
      const hidden = hiddenPositions(round, me)
      if (!pair.every(i => hidden.includes(i))) return bad('Открытую плитку менять нельзя')
      const [x, y] = pair.map(i => round.board[me]?.[i])
      if (x == null || y == null) return bad('Пустая позиция')
      if (isBlack(x) === isBlack(y)) return bad('Нужны одна чёрная и одна белая плитка')
      return done(submitSwap(game, me, pair))
    }

    case 'reveal': {
      if (game.phase !== 'swap') return bad('Сейчас не фаза обмена')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      const round = currentRound(game)
      if (!round || round.finishedAt) return bad('Игра закончена')
      if (round.swapStep !== 'reveal') return bad('Сейчас меняют плитки, а не открывают')
      if (round.submitted[me] != null) return bad('Вы уже выбрали плитку')

      const position = body.position
      if (position == null || !hiddenPositions(round, me).includes(position)) {
        return bad('Выберите свою закрытую плитку')
      }
      return done(submitSwap(game, me, [position]))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
