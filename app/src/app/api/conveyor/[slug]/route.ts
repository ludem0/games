import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { getParticipants } from '@/lib/seasons'
import {
  getGame, saveGame, viewFor, currentRound, duelists,
  startRound, processRound, closeMarket, resetGame,
  swapPips, increasePip, SLOTS, PIPS, TRACK_LIMIT,
  type ConveyorGame, type RoundSetup, type Slot, type Track, type Sale,
} from '@/lib/conveyor'

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
  return NextResponse.json(viewFor(game, user.username))
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
    ec?: string; opponent?: string
    setup?: RoundSetup
    loader?: (number | null)[]
    slot?: Slot; machine?: string
    tracks?: Record<number, Track>
    sales?: Sale[]
    item?: '1star' | '2star' | '3star'
    from?: number; to?: number; position?: number
  }

  const done = (g: ConveyorGame) => {
    saveGame(g)
    return NextResponse.json(viewFor(g, me))
  }

  const round = currentRound(game)
  const seat = round?.players[me] ?? null

  switch (body.action) {
    case 'roles': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'setup' || game.rounds.length > 0) return bad('Игроки назначаются до первого раунда')
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

    case 'startround': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (duelists(game).length !== 2) return bad('Сначала назначьте игроков')
      if (game.phase !== 'setup') return bad('Раунд уже идёт')
      const setup = body.setup
      if (!setup || setup.pips.length !== PIPS) return bad(`Нужно ${PIPS} пипов`)
      if (setup.machines.length !== SLOTS.length) return bad('Нужно шесть машин')
      return done(startRound(game, setup))
    }

    case 'stage': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'loading') return bad('Сейчас не загрузка')
      // three stages of loading, then the machines are placed
      game.loadStage = Math.min(4, game.loadStage + 1)
      if (game.loadStage > 3) game.phase = 'machines'
      return done(game)
    }

    case 'load': {
      if (game.phase !== 'loading' || !seat || !round) return bad('Сейчас не загрузка')
      const loader = body.loader ?? []
      if (loader.length !== PIPS) return bad('Загрузчик на девять мест')
      const placed = loader.filter((v): v is number => v != null)
      const spare = [...round.setup.pips]
      for (const value of placed) {
        const index = spare.indexOf(value)
        if (index < 0) return bad(`Пипа ${value} у вас нет`)
        spare.splice(index, 1)
      }
      if (placed.length > game.loadStage * 3) return bad('На этом этапе столько пипов ставить рано')
      seat.loader = loader
      return done(game)
    }

    case 'machine': {
      if (game.phase !== 'machines' || !seat || !round) return bad('Сейчас не расстановка машин')
      const slot = body.slot
      const machine = round.setup.machines.find(m => m.id === body.machine)
      if (!slot || !SLOTS.includes(slot)) return bad('Такого места нет')
      if (!machine) return bad('Такой машины нет')
      if (machine.colour !== round.setup.slotColours[slot]) return bad('Цвет машины не совпадает с местом')
      if (Object.entries(seat.placements).some(([s, id]) => id === machine.id && s !== slot)) {
        return bad('Эта машина уже стоит в другом месте')
      }
      seat.placements = { ...seat.placements, [slot]: machine.id }
      return done(game)
    }

    case 'tracks': {
      if (game.phase !== 'machines' && game.phase !== 'tracks') return bad('Сейчас не выбор дорожек')
      if (!seat) return bad('Вы не в игре')
      const tracks = body.tracks ?? {}
      const upper = Object.values(tracks).filter(t => t === 'upper').length
      const lower = Object.values(tracks).filter(t => t === 'lower').length
      if (upper > TRACK_LIMIT || lower > TRACK_LIMIT) return bad(`На дорожке помещается ${TRACK_LIMIT} пипов`)
      seat.tracks = tracks
      return done(game)
    }

    case 'item': {
      if (!seat || !round) return bad('Раунд не идёт')
      if (game.phase !== 'machines' && game.phase !== 'tracks') {
        return bad('Предметы применяются до выбора дорожек')
      }
      if (body.item === '1star') {
        if (body.from == null || body.to == null) return bad('Назовите две позиции')
        seat.loader = swapPips(seat.loader, body.from, body.to)
        seat.itemsUsed = [...seat.itemsUsed, 'swap']
      }
      if (body.item === '2star') {
        if (body.position == null) return bad('Назовите позицию')
        seat.loader = increasePip(seat.loader, body.position)
        seat.itemsUsed = [...seat.itemsUsed, 'increase']
      }
      if (body.item === '3star') {
        if (body.position == null) return bad('Назовите позицию')
        seat.itemsUsed = [...seat.itemsUsed, `skip:${body.position}`]
        game.threeStarOwner = me
      }
      return done(game)
    }

    case 'process': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'machines' && game.phase !== 'tracks') return bad('Ещё рано')
      return done(processRound(game))
    }

    case 'sell': {
      if (game.phase !== 'market' || !seat) return bad('Рынок не открыт')
      seat.sales = body.sales ?? []
      return done(game)
    }

    case 'closemarket': {
      if (!isAdmin) return bad('Forbidden', 403)
      if (game.phase !== 'market') return bad('Рынок не открыт')
      return done(closeMarket(game))
    }

    case 'reset': {
      if (!isAdmin) return bad('Forbidden', 403)
      return done(resetGame(game))
    }

    default:
      return bad('Неизвестное действие')
  }
}
