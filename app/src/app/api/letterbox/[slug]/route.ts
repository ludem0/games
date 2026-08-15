import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import { isValidWord } from '@/lib/words'
import {
  getGame, saveGame, applyClock, viewFor, duelists, other,
  dealOpening, submitHold, dealObserverLetters, startLive,
  submitWord, pickCategory, guessLetter, lastChance, skipTurn, resetGame,
  HAND_SIZE, type Category, type LetterboxGame,
} from '@/lib/letterbox'

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

  // the clock is settled on every read, so an abandoned turn still expires
  const before = JSON.stringify(game)
  const ticked = applyClock(game)
  if (JSON.stringify(ticked) !== before) saveGame(ticked)

  return NextResponse.json(viewFor(ticked, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params

  const body = await req.json() as {
    action: string
    ec?: string; opponent?: string
    letters?: string[]; word?: string; category?: Category; letter?: string; discard?: string
  }

  const stored = getGame(slug)
  if (!stored) return bad('Not found', 404)
  const game = applyClock(stored)

  const isAdmin = user.role === 'admin'
  const me = user.username

  const done = (g: LetterboxGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  switch (body.action) {
    // ---- admin: roles and dealing ----
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Роли назначаются до раздачи')
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

    case 'deal': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (duelists(game).length !== 2) return bad('Сначала назначьте роли')
      if (game.phase !== 'setup') return bad('Руки уже розданы')
      return done(dealOpening(game))
    }

    // ---- duelists: holding letters ----
    case 'hold': {
      if (!duelists(game).includes(me)) return bad('Forbidden', 403)
      if (game.phase !== 'hold1' && game.phase !== 'hold2') return bad('Сейчас не фаза удержания')
      if (game.holds[me] != null) return bad('Вы уже выбрали')
      const letters = (body.letters ?? []).filter(l => (game.hands[me] ?? []).includes(l))
      if (letters.length > HAND_SIZE) return bad('Слишком много букв')

      const wasHold2 = game.phase === 'hold2'
      const next = submitHold(game, me, letters)
      // the second hold finishes the setup: outsiders get their letters and play starts
      if (wasHold2 && next.phase === 'live') {
        const observers = getParticipants(next.seasonSlug).filter(p => !duelists(next).includes(p))
        dealObserverLetters(next, observers)
        startLive(next)
      }
      return done(next)
    }

    // ---- live turns ----
    case 'word': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.pending) return bad('Сначала завершите текущее слово')
      const word = (body.word ?? '').trim().toLowerCase()
      if (word.length < 3) return bad('Слово от 3 букв')
      if (!/^[a-z]+$/.test(word)) return bad('Только латинские буквы')
      if (game.usedWords.includes(word)) return bad('Это слово уже было')
      if (!isValidWord(word)) return bad('Слова нет в словаре Scrabble')
      return done(submitWord(game, me, word))
    }

    case 'category': {
      if (game.phase !== 'live' || !game.pending) return bad('Нет слова на столе')
      if (game.pending.waitingOn !== me) return bad('Сейчас выбирает не вы')
      const category = body.category
      if (category !== 'none' && category !== 'one' && category !== 'any') return bad('Неизвестная категория')
      // the submitter picks from what the opponent left
      if (me === game.pending.submitter && game.pending.opponentPick === category) {
        return bad('Эту категорию уже забрал соперник')
      }
      return done(pickCategory(game, me, category))
    }

    case 'guess': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.pending) return bad('Сначала завершите текущее слово')
      const letter = (body.letter ?? '').toUpperCase()
      const discard = (body.discard ?? '').toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return bad('Выберите букву')
      if (!(game.hands[me] ?? []).includes(discard)) return bad('Укажите свою букву на списание при промахе')
      if ((game.lostLetters[other(game, me)] ?? []).includes(letter)) return bad('Эта буква уже вышла из игры')
      return done(guessLetter(game, me, letter, discard))
    }

    case 'lastchance': {
      if (game.phase !== 'live') return bad('Игра не идёт')
      if (game.turn !== me) return bad('Сейчас не ваш ход')
      if (game.pending) return bad('Сначала завершите текущее слово')
      const letters = (body.letters ?? []).map(l => l.toUpperCase()).filter(l => /^[A-Z]$/.test(l))
      if (letters.length === 0) return bad('Назовите буквы')
      return done(lastChance(game, me, letters))
    }

    // ---- admin: nudges ----
    case 'skip': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(skipTurn(game))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
