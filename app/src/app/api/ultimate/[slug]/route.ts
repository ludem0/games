import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, currentRound,
  startRound, play, legalCells, resetGame,
  MAX_GAMES, type UltimateGame,
} from '@/lib/ultimate'

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

  // the clock is settled on every read, so a turn left alone still expires
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
    ec?: string; opponent?: string; starter?: string; cell?: number
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: UltimateGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  switch (body.action) {
    // ---- admin: roles and the series ----
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Роли назначаются до начала серии')
      const roster = getParticipants(game.seasonSlug)
      if (!body.ec || !body.opponent) return bad('Нужны оба игрока')
      if (body.ec === body.opponent) return bad('Это должны быть разные игроки')
      for (const p of [body.ec, body.opponent]) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      if (body.starter && body.starter !== body.ec && body.starter !== body.opponent) {
        return bad('Первым ходит один из этих двоих')
      }
      game.ec = body.ec
      game.opponent = body.opponent
      game.firstStarter = body.starter ?? body.opponent
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
      if (game.phase !== 'live') return bad('Серия не идёт')
      const round = currentRound(game)
      if (!round?.finishedAt) return bad('Текущая игра ещё не закончена')
      if (game.rounds.length >= MAX_GAMES) return bad('Сыграны все три игры')
      return done(startRound(game))
    }

    // ---- duelists: the move ----
    case 'move': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const round = currentRound(game)
      if (!round || round.finishedAt) return bad('Игра уже закончена')
      const cell = body.cell
      if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 80) {
        return bad('Неверная клетка')
      }
      if (!legalCells(round).includes(cell)) return bad('Сюда ходить нельзя')
      return done(play(game, me, cell))
    }

    // ---- admin: nudges ----
    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
