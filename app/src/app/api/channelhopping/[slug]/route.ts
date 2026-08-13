import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, duelists, roundAt,
  startGame, finishGame, submit, resetGame,
  CHANNELS, ROUNDS, COLLECTION_ROUNDS,
  type ChGame, type Channel, type ChContent,
} from '@/lib/channelHopping'

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

  return NextResponse.json(viewFor(ticked, user.username, user.role === 'admin'))
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
    ec?: string; opponent?: string; advantage?: string
    content?: ChContent
    channel?: Channel; text?: string
  }

  const done = (g: ChGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.startedAt) return bad('Игра уже идёт')
      const roster = getParticipants(game.seasonSlug)
      if (!body.ec || !body.opponent) return bad('Нужны оба игрока')
      if (body.ec === body.opponent) return bad('Это должны быть разные игроки')
      for (const p of [body.ec, body.opponent]) {
        if (!roster.includes(p)) return bad(`${p} не участник сезона`)
      }
      game.ec = body.ec
      game.opponent = body.opponent
      game.advantage = body.advantage && [body.ec, body.opponent].includes(body.advantage)
        ? body.advantage
        : body.opponent
      return done(game)
    }

    case 'content': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.startedAt) return bad('Задания заводятся до старта')
      const content = body.content
      if (!content) return bad('Нет содержимого')
      if (content.five.length < ROUNDS) return bad(`FIVE: нужно ${ROUNDS} заданий`)
      if (content.integer.length < ROUNDS) return bad(`INTEGER: нужно ${ROUNDS} заданий`)
      if (content.animal.length < ROUNDS) return bad(`ANIMAL: нужно ${ROUNDS} заданий`)
      if (content.collections.length < COLLECTION_ROUNDS.length) {
        return bad(`COLLECTION: нужно ${COLLECTION_ROUNDS.length} категории`)
      }
      if (content.integer.some(task => !Number.isInteger(task.answer))) {
        return bad('INTEGER: ответ должен быть целым числом')
      }
      game.content = content
      return done(game)
    }

    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (duelists(game).length !== 2) return bad('Сначала назначьте игроков')
      if (game.startedAt && !game.finishedAt) return bad('Игра уже идёт')
      return done(startGame(game))
    }

    case 'finish': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (!game.startedAt) return bad('Игра не начиналась')
      return done(finishGame(game))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    case 'answer': {
      if (!duelists(game).includes(me)) return bad('Отвечают только двое игроков')
      if (!game.startedAt || game.finishedAt) return bad('Игра не идёт')
      const round = roundAt(game)
      if (round == null) return bad('Раунд закончился')
      const channel = body.channel
      if (!channel || !CHANNELS.includes(channel)) return bad('Неизвестный канал')
      const text = (body.text ?? '').trim()
      if (!text) return bad('Пустой ответ')
      if (text.length > 60) return bad('Слишком длинный ответ')
      return done(submit(game, me, channel, text))
    }

    default:
      return bad('Неизвестное действие')
  }
}
