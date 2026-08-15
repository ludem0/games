import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, addBalances } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, isOpen,
  startGame, pickPuzzle, guess, placeOnTower, resetGame, opalAward,
  TOWER_MAX,
  type PuzzleChambersGame, type Award, type PuzzleType,
} from '@/lib/puzzleChambers'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** This is a garnet match, so everything it pays lands in the season at once. */
function awarderFor(seasonSlug: string): Award {
  return (player, psigems) => addBalances(seasonSlug, 'psigems', { [player]: psigems })
}

/** Clear opals are handed out once the match is over. */
function settle(game: PuzzleChambersGame): void {
  if (game.phase !== 'finished') return
  const winners = opalAward(game)
  if (winners.length === 0 || game.log.some(e => e.text.includes('прозрачные опалы'))) return
  addBalances(game.seasonSlug, 'clearOpals', Object.fromEntries(winners.map(p => [p, 1])))
  game.log = [...game.log, {
    at: new Date().toISOString(),
    text: `Задача на опал: прозрачные опалы получают ${winners.join(', ')}.`,
    kind: 'end',
  }]
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const before = JSON.stringify(game)
  const ticked = applyClock(game, awarderFor(game.seasonSlug))
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
    players?: string[]; first?: string
    puzzles?: { number: number; type?: PuzzleType; question: string; answer: string }[]
    number?: number; text?: string; tower?: string; add?: boolean
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const award = awarderFor(stored.seasonSlug)
  const game = applyClock(stored, award)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: PuzzleChambersGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  switch (body.action) {
    case 'puzzles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Задачи заводятся до старта')
      for (const entry of body.puzzles ?? []) {
        const puzzle = game.puzzles.find(p => p.number === entry.number)
        if (!puzzle) continue
        puzzle.question = entry.question
        puzzle.answer = entry.answer
        if (entry.type) puzzle.type = entry.type
      }
      return done(game)
    }

    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      const players = body.players ?? []
      if (players.length !== 3) return bad('В этом матче ровно три игрока')
      if (!players.every(p => roster.includes(p))) return bad('Все трое должны быть в сезоне')
      if (game.puzzles.some(p => !p.answer)) return bad('Сначала заполните ответы ко всем 50 задачам')
      const first = players.includes(body.first ?? '') ? body.first! : players[0]
      return done(startGame(game, players, first, getPsigems(game.seasonSlug)))
    }

    case 'pick': {
      if (game.phase !== 'picking') return bad('Сейчас не выбор задачи')
      if (game.active !== me) return bad('Выбирает активный игрок')
      const number = body.number
      if (number == null || !isOpen(game, number)) return bad('Эта задача не граничит с серой клеткой')
      return done(pickPuzzle(game, number))
    }

    case 'guess': {
      if (game.phase !== 'solving') return bad('Сейчас никто не решает')
      if (!game.players.includes(me)) return bad('Отвечают только игроки матча')
      if (game.guesses[me]) return bad('У вас была одна попытка')
      const text = (body.text ?? '').trim()
      if (!text) return bad('Пустой ответ')
      return done(guess(game, me, text, award))
    }

    case 'place': {
      if (game.phase !== 'placing') return bad('Сейчас не размещение числа')
      if (game.active !== me) return bad('Число ставит решивший задачу')
      const tower = body.tower ?? ''
      if (!game.players.includes(tower)) return bad('Такой башни нет')
      const puzzle = game.puzzles.find(p => p.number === game.current)
      const next = (game.towers[tower] ?? 0) + (body.add ? (puzzle?.number ?? 0) : -(puzzle?.number ?? 0))
      if (next < 0 || next > TOWER_MAX) return bad(`Высота башни должна остаться от 0 до ${TOWER_MAX}`)
      return done(placeOnTower(game, tower, !!body.add, award))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
