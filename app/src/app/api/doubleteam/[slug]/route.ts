import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants, getPsigems, savePsigems } from '@/lib/seasons'
import { getChats, saveChat, newId, type Chat } from '@/lib/chats'
import { identityLettersFor } from '@/lib/letterbox'
import {
  getGame, saveGame, buildGrid, setLetter, openRound, currentRound, submitPick,
  buyImmunity, closeRound, historyOf, canTalk, viewFor, finalPsigems,
  losers, opalResult, submitOpalGuess,
  IMMUNITY_COST, MESSAGE_COST, MESSAGE_LIMIT, DEFAULT_ROUND_HOURS,
  type DoubleTeamGame,
} from '@/lib/doubleTeam'
import { pickIsLegal, COLOURS, type Sign, type Colour } from '@/lib/doubleTeamScoring'

type Params = { params: Promise<{ slug: string }> }

async function getUser(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  if (!cookie) return null
  return await verifyToken(cookie)
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function spend(seasonSlug: string, username: string, amount: number): boolean {
  const psigems = getPsigems(seasonSlug)
  if ((psigems[username] ?? 0) < amount) return false
  savePsigems(seasonSlug, { ...psigems, [username]: (psigems[username] ?? 0) - amount })
  return true
}

function grant(seasonSlug: string, grants: Record<string, number>): void {
  if (Object.keys(grants).length === 0) return
  const psigems = getPsigems(seasonSlug)
  for (const [user, amount] of Object.entries(grants)) {
    psigems[user] = (psigems[user] ?? 0) + amount
  }
  savePsigems(seasonSlug, psigems)
}

/** Row and column threads, so the allowed conversations exist from the start. */
function createLineChats(game: DoubleTeamGame): void {
  const existing = new Set(getChats(game.seasonSlug).map(c => c.title))
  const lines: { title: string; members: string[] }[] = []

  for (let r = 0; r < 3; r++) {
    lines.push({
      title: `${game.name} · строка ${r + 1}`,
      members: game.players.filter(p => p.row === r).map(p => p.username),
    })
  }
  for (let c = 0; c < 4; c++) {
    lines.push({
      title: `${game.name} · столбец ${c + 1}`,
      members: game.players.filter(p => p.col === c).map(p => p.username),
    })
  }

  for (const line of lines) {
    if (existing.has(line.title) || line.members.length === 0) continue
    const chat: Chat = {
      id: newId(),
      title: line.title,
      members: line.members,
      createdBy: 'система',
      createdAt: new Date().toISOString(),
      messages: [],
    }
    saveChat(game.seasonSlug, chat)
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params
  const game = getGame(slug)
  if (!game) return bad('Not found', 404)
  return NextResponse.json(viewFor(game, user.username, user.role === 'admin'))
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser(req)
  if (!user) return bad('Unauthorized', 401)
  const { slug } = await params
  const game = getGame(slug)
  if (!game) return bad('Not found', 404)

  const isAdmin = user.role === 'admin'
  const me = user.username
  const body = await req.json() as {
    action: string
    sign?: Sign; colour?: Colour
    hours?: number
    username?: string; letter?: string
    to?: string; text?: string
    guess?: Record<string, string>
  }

  const done = (g: DoubleTeamGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me, isAdmin))
  }

  switch (body.action) {
    case 'grid': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.status !== 'setup') return bad('Сетка уже составлена')
      const roster = getParticipants(game.seasonSlug)
      if (roster.length < 2) return bad('В сезоне нет участников')

      // identity letters come from the deathmatch that handed them out
      const known = identityLettersFor(game.seasonSlug)
      buildGrid(game, roster, known)
      createLineChats(game)
      return done(game)
    }

    case 'letter': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (!body.username || !body.letter) return bad('Нужны игрок и буква')
      const letter = body.letter.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return bad('Буква латинского алфавита')
      return done(setLetter(game, body.username, letter))
    }

    case 'open': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.status === 'finished') return bad('Матч завершён')
      if (game.players.length === 0) return bad('Сначала составьте сетку')
      if (currentRound(game)) return bad('Раунд уже идёт')
      return done(openRound(game, body.hours && body.hours > 0 ? body.hours : DEFAULT_ROUND_HOURS))
    }

    case 'pick': {
      const round = currentRound(game)
      if (!round) return bad('Раунд не открыт')
      if (!game.players.some(p => p.username === me)) return bad('Вы не в сетке', 403)
      const sign = body.sign
      const colour = body.colour
      if (sign !== 'X' && sign !== 'O') return bad('Выберите знак')
      if (!colour || !COLOURS.includes(colour)) return bad('Выберите цвет')
      const legal = pickIsLegal({ sign, colour }, historyOf(game, me))
      if (!legal.ok) return bad(legal.reason ?? 'Такой выбор запрещён')
      return done(submitPick(game, me, { sign, colour }))
    }

    case 'immunity': {
      const round = currentRound(game)
      if (!round) return bad('Раунд не открыт')
      if (!game.players.some(p => p.username === me)) return bad('Вы не в сетке', 403)
      if (round.immune.includes(me)) return bad('Иммунитет уже куплен')
      if (!spend(game.seasonSlug, me, IMMUNITY_COST)) return bad(`Нужно ${IMMUNITY_COST} псигема`)
      return done(buyImmunity(game, me))
    }

    case 'message': {
      if (!game.players.some(p => p.username === me)) return bad('Вы не в сетке', 403)
      const to = body.to ?? ''
      const text = (body.text ?? '').trim()
      if (!game.players.some(p => p.username === to)) return bad('Такого игрока нет в сетке')
      if (to === me) return bad('Себе писать незачем')
      if (text.length === 0) return bad('Пустое сообщение')
      if (text.length > MESSAGE_LIMIT) return bad(`Не длиннее ${MESSAGE_LIMIT} символов`)
      // talking inside your row or column is free; anything else is paid
      const free = canTalk(game, me, to)
      if (!free && !spend(game.seasonSlug, me, MESSAGE_COST)) return bad(`Нужен ${MESSAGE_COST} псигем`)

      const title = `${game.name} · ${[me, to].sort().join(' и ')}`
      const chat = getChats(game.seasonSlug).find(c => c.title === title) ?? {
        id: newId(), title, members: [me, to], createdBy: me,
        createdAt: new Date().toISOString(), messages: [],
      }
      chat.messages = [...chat.messages, { id: newId(), author: me, text, at: new Date().toISOString() }]
      saveChat(game.seasonSlug, chat)
      return done(game)
    }

    case 'opal': {
      if (game.status === 'finished') return bad('Матч уже завершён')
      const guess = body.guess ?? {}
      if (Object.keys(guess).length === 0) return bad('Пустая догадка')
      return done(submitOpalGuess(game, me, guess))
    }

    case 'close': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (!currentRound(game)) return bad('Нет открытого раунда')
      const { game: next, psigemGrants } = closeRound(game)
      grant(next.seasonSlug, psigemGrants)
      if (next.status === 'finished') {
        grant(next.seasonSlug, finalPsigems(next))
        next.log = [...next.log, {
          at: new Date().toISOString(),
          text: `Псигемы за итог начислены. Кандидаты на выбывание: ${losers(next).join(', ')}`,
        }]
        const opal = opalResult(next)
        if (opal.winner) {
          next.log = [...next.log, { at: new Date().toISOString(), text: `Opal Challenge: ${opal.winner}` }]
        } else if (opal.correctGuessers.length > 1) {
          grant(next.seasonSlug, Object.fromEntries(opal.correctGuessers.map(u => [u, 1])))
          next.log = [...next.log, {
            at: new Date().toISOString(),
            text: `Opal Challenge провален, угадавших несколько: ${opal.correctGuessers.join(', ')}. Каждому по псигему`,
          }]
        }
      }
      return done(next)
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done({
        ...game,
        status: 'setup', players: [], rounds: [], points: {}, uniqueBonuses: {},
        opalGuesses: {}, winners: [], log: [],
      })
    }

    default:
      return bad('Неизвестное действие')
  }
}

