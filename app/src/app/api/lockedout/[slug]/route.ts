import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, addBalances } from '@/lib/seasons'
import {
  getGame, saveGame, applyClock, viewFor, safeOf, canPlay,
  startGame, closeRound, resetGame, payoutFor, inVault,
  DIGITS, SAFE_LETTERS,
  type LockedOutGame,
} from '@/lib/lockedOut'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** The gold turns into psigems once, when the doors are finally shut. */
function settle(game: LockedOutGame): void {
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
  const ticked = applyClock(game)
  settle(ticked)
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
    players?: string[]
    safe?: string; left?: number; right?: number
    side?: 'left' | 'right'; value?: number; partner?: string
    gold?: number; keys?: number
  }

  const done = (g: LockedOutGame) => {
    settle(g)
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  const playing = game.players.includes(me) && !game.escaped.includes(me)

  switch (body.action) {
    case 'start': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup') return bad('Матч уже идёт')
      const roster = getParticipants(game.seasonSlug)
      const players = body.players ?? []
      if (players.length < 2) return bad('Нужно хотя бы двое')
      if (!players.every(p => roster.includes(p))) return bad('Все игроки должны быть в сезоне')
      return done(startGame(game, players))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'live') return bad('Матч не идёт')
      return done(closeRound(game))
    }

    case 'solo': {
      if (game.phase !== 'live') return bad('Матч не идёт')
      if (!playing) return bad('Вы уже вне хранилища')
      const { safe, left, right } = body
      if (!safe || !SAFE_LETTERS.includes(safe)) return bad('Такого сейфа нет')
      const target = safeOf(game, safe)
      if (!target || target.open) return bad('Этот сейф уже вскрыт')
      if (!DIGITS.includes(left ?? 0) || !DIGITS.includes(right ?? 0)) return bad('Номера от 1 до 4')

      const entry = game.attempts[me] ?? {}
      const dualCards = entry.dual ? [entry.dual.value] : []
      if (!canPlay(game.hands[me] ?? [], [...dualCards, left!, right!])) {
        return bad('Столько карт у вас нет, или карта уже занята другим сейфом')
      }
      if (entry.dual?.safe === safe) return bad('На один сейф можно зайти одним способом')
      game.attempts = { ...game.attempts, [me]: { ...entry, solo: { kind: 'solo', safe, left: left!, right: right! } } }
      return done(game)
    }

    case 'dual': {
      if (game.phase !== 'live') return bad('Матч не идёт')
      if (!playing) return bad('Вы уже вне хранилища')
      const { safe, side, value, partner } = body
      if (!safe || !SAFE_LETTERS.includes(safe)) return bad('Такого сейфа нет')
      const target = safeOf(game, safe)
      if (!target || target.open) return bad('Этот сейф уже вскрыт')
      if (side !== 'left' && side !== 'right') return bad('Выберите сторону замка')
      if (!DIGITS.includes(value ?? 0)) return bad('Номер от 1 до 4')
      if (!partner || partner === me) return bad('Выберите напарника')
      if (!inVault(game).includes(partner)) return bad('Этот игрок уже вышел из хранилища')

      const entry = game.attempts[me] ?? {}
      const soloCards = entry.solo ? [entry.solo.left, entry.solo.right] : []
      if (!canPlay(game.hands[me] ?? [], [...soloCards, value!])) {
        return bad('Столько карт у вас нет, или карта уже занята другим сейфом')
      }
      if (entry.solo?.safe === safe) return bad('На один сейф можно зайти одним способом')
      game.attempts = {
        ...game.attempts,
        [me]: { ...entry, dual: { kind: 'dual', safe, side, value: value!, partner } },
      }
      return done(game)
    }

    case 'claim': {
      if (game.phase !== 'live') return bad('Матч не идёт')
      const bargain = game.bargains.find(b => b.safe === body.safe && b.players.includes(me))
      if (!bargain) return bad('Вы не делите этот сейф')
      const gold = Math.max(0, Math.min(2, Math.floor(Number(body.gold ?? 0))))
      const keys = Math.max(0, Math.min(1, Math.floor(Number(body.keys ?? 0))))
      bargain.claims = { ...bargain.claims, [me]: { gold, keys } }
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
