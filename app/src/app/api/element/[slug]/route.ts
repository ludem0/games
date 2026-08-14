import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, canPlace, stepsFor, jumpsFor,
  startGame, drawStones, step, jump, placeStone, endTurn, resetGame,
  SIZE, DRAW, STONES, indexOf,
  type ElementGame, type Stone,
} from '@/lib/element'

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
    count?: number
    to?: number; over?: number[]
    stone?: Stone; square?: number; direction?: [number, number]
  }

  const done = (g: ElementGame) => {
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
      const first = body.first && duelists(game).includes(body.first) ? body.first : duelists(game)[1]
      const second = first === game.ec ? game.opponent! : game.ec!
      // the sages start facing each other from the middle of opposite edges
      return done(startGame(game, first, {
        [first]: indexOf(Math.floor(SIZE / 2), SIZE - 1),
        [second]: indexOf(Math.floor(SIZE / 2), 0),
      }))
    }

    case 'draw': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.current.drawn) return bad('Камни на этот ход уже взяты')
      const count = body.count
      if (count == null || !Number.isInteger(count) || count < 0 || count > DRAW) {
        return bad(`Взять можно от 0 до ${DRAW} камней`)
      }
      return done(drawStones(game, me, count))
    }

    case 'step': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.current.moves <= 0) return bad('Шагов не осталось')
      const to = body.to
      if (to == null || !stepsFor(game, me).includes(to)) return bad('Туда шагнуть нельзя')
      return done(step(game, me, to))
    }

    case 'jump': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const options = jumpsFor(game, me)
      const chosen = options.find(option => option.to === body.to)
      if (!chosen) return bad('Такого прыжка нет')
      return done(jump(game, me, chosen.to, chosen.over))
    }

    case 'place': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      const stone = body.stone
      const square = body.square
      if (!stone || !STONES.includes(stone)) return bad('Неизвестный камень')
      if (!game.current.pending.includes(stone)) return bad('Такого камня у вас на руках нет')
      if (square == null || square < 0 || square >= SIZE * SIZE) return bad('Клетка вне доски')
      if (!canPlace(game, stone, square)) return bad('Сюда этот камень не кладётся')

      const result = placeStone(game, me, stone, square, body.direction)
      if (result.problem) return bad(result.problem)
      return done(result.game)
    }

    case 'end': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.current.pending.length > 0) return bad('Все взятые камни надо выложить')
      return done(endTurn(game, me))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
