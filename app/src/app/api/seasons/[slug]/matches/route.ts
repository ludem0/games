import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getMatches, saveMatches, getParticipants } from '@/lib/seasons'
import type { Match } from '@/lib/seasons'
import {
  createSeasonGame, seasonGameSlug, syncParticipants, getMinigame, saveMinigame,
} from '@/lib/minigames'
import { createGame as createLetterbox } from '@/lib/letterbox'
import { createGame as createDoubleTeam } from '@/lib/doubleTeam'
import { createGame as createUltimate } from '@/lib/ultimate'
import { createGame as createSwapping } from '@/lib/swapping'
import { createGame as createKingsCourt } from '@/lib/kingsCourt'
import { createGame as createElevatorRace } from '@/lib/elevatorRace'
import { createGame as createChannelHopping } from '@/lib/channelHopping'
import { createGame as createPathing } from '@/lib/pathing'
import { createGame as createDominoBw } from '@/lib/dominoBw'
import { createGame as createChambers } from '@/lib/puzzleChambers'
import { createGame as createRooms } from '@/lib/modularRooms'
import { createGame as createField } from '@/lib/fieldTactics'
import { createGame as createVault } from '@/lib/lockedOut'
import { createGame as createJanggi } from '@/lib/numberJanggi'
import { createGame as createCube } from '@/lib/theCube'
import { createGame as createPossession } from '@/lib/possession'
import { createGame as createTotemic } from '@/lib/totemic'
import { createGame as createConveyor } from '@/lib/conveyor'
import { createGame as createTug } from '@/lib/tugOfWar'

async function getRole() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  const user = await verifyToken(token)
  return user ?? null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let matches = getMatches(slug)

  // main matches made before games moved into seasons have no game yet: give them one
  if (user.role === 'admin' && matches.some(m => m.type === 'main' && !m.minigameSlug)) {
    matches = matches.map(m =>
      m.type === 'main' && !m.minigameSlug ? { ...m, minigameSlug: seasonGameSlug(slug, m.id) } : m)
    saveMatches(slug, matches)
    for (const m of matches) {
      if (m.type === 'main' && m.minigameSlug) {
        if ((m.game ?? 'track_trouble') === 'track_trouble') {
          createSeasonGame(m.minigameSlug, slug, m.name, getParticipants(slug))
        }
      }
    }
  }

  const visible = user.role === 'admin'
    ? matches
    : matches.map(m => ({ ...m, name: m.visible ? m.name : '???' }))

  return NextResponse.json({ matches: visible })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const matches = getMatches(slug)

  const type: 'main' | 'death' = body.type ?? 'main'
  const id = `m${Date.now()}`
  const sameType = matches.filter(m => m.type === type).length + 1

  // both kinds of match now name their game, and each kind has its own default
  const DEATH_GAMES = ['letterbox', 'ultimate_ttt', 'swapping_bw', 'channel_hopping', 'pathing_dab', 'domino_bw', 'field_tactics', 'number_janggi', 'conveyor', 'tug_of_war'] as const
  const MAIN_GAMES = ['track_trouble', 'double_team', 'kings_court', 'elevator_race', 'puzzle_chambers', 'modular_rooms', 'locked_out', 'the_cube', 'possession', 'totemic'] as const
  const allowed: readonly string[] = type === 'death' ? DEATH_GAMES : MAIN_GAMES
  const game: NonNullable<Match['game']> = allowed.includes(body.game ?? '')
    ? body.game as NonNullable<Match['game']>
    : (type === 'death' ? 'letterbox' : 'track_trouble')
  const GAME_NAMES = {
    track_trouble: 'Track Trouble', double_team: 'Double Team',
    letterbox: 'Letterbox', ultimate_ttt: 'Ultimate Tic Tac Toe',
    swapping_bw: 'Swapping Black and White', kings_court: "King's Court",
    elevator_race: 'Doubting Middle Elevator Race', channel_hopping: 'Channel Hopping',
    pathing_dab: 'Pathing Dots and Boxes', domino_bw: 'Domino Black and White',
    puzzle_chambers: 'Puzzle Sum Chambers', modular_rooms: 'Three Modular Rooms',
    field_tactics: 'Field Tactics', locked_out: 'Locked Out!',
    number_janggi: 'Number Janggi', the_cube: 'The Cube',
    possession: 'Five Fold Possession', totemic: 'Totemic Might',
    conveyor: 'Conveyor', tug_of_war: 'Tug of War',
  }
  const defaultName = `${type === 'main' ? 'MM' : 'DM'}${sameType}: ${GAME_NAMES[game]}`

  const newMatch: Match = {
    id,
    type,
    game,
    name: body.name ?? defaultName,
    visible: body.visible ?? true,
    accessible: body.accessible ?? false,
    // the game is created right here and the slug comes from the season and the
    // match instead of being typed by hand
    minigameSlug: seasonGameSlug(slug, id),
  }

  const gameSlug = seasonGameSlug(slug, id)
  if (game === 'track_trouble') createSeasonGame(gameSlug, slug, newMatch.name, getParticipants(slug))
  else if (game === 'double_team') createDoubleTeam(gameSlug, slug, newMatch.name, id)
  else if (game === 'ultimate_ttt') createUltimate(gameSlug, slug, newMatch.name, id)
  else if (game === 'swapping_bw') createSwapping(gameSlug, slug, newMatch.name, id)
  else if (game === 'kings_court') createKingsCourt(gameSlug, slug, newMatch.name, id)
  else if (game === 'elevator_race') createElevatorRace(gameSlug, slug, newMatch.name, id)
  else if (game === 'channel_hopping') createChannelHopping(gameSlug, slug, newMatch.name, id)
  else if (game === 'pathing_dab') createPathing(gameSlug, slug, newMatch.name, id)
  else if (game === 'domino_bw') createDominoBw(gameSlug, slug, newMatch.name, id)
  else if (game === 'puzzle_chambers') createChambers(gameSlug, slug, newMatch.name, id)
  else if (game === 'modular_rooms') createRooms(gameSlug, slug, newMatch.name, id)
  else if (game === 'field_tactics') createField(gameSlug, slug, newMatch.name, id)
  else if (game === 'locked_out') createVault(gameSlug, slug, newMatch.name, id)
  else if (game === 'number_janggi') createJanggi(gameSlug, slug, newMatch.name, id)
  else if (game === 'the_cube') createCube(gameSlug, slug, newMatch.name, id)
  else if (game === 'possession') createPossession(gameSlug, slug, newMatch.name, id)
  else if (game === 'totemic') createTotemic(gameSlug, slug, newMatch.name, id)
  else if (game === 'conveyor') createConveyor(gameSlug, slug, newMatch.name, id)
  else if (game === 'tug_of_war') createTug(gameSlug, slug, newMatch.name, id)
  else createLetterbox(gameSlug, slug, newMatch.name, id)

  saveMatches(slug, [...matches, newMatch])
  return NextResponse.json({ matches: getMatches(slug) })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const matches = getMatches(slug)
  const updated = matches.map(m => m.id === body.id ? { ...m, ...body } : m)
  saveMatches(slug, updated)

  // a renamed main match renames its game, and the roster always follows the season
  const match = updated.find(m => m.id === body.id)
  if (match?.type === 'main' && match.minigameSlug) {
    const game = getMinigame(match.minigameSlug)
    if (game) saveMinigame(match.minigameSlug, { ...game, name: match.name })
    syncParticipants(match.minigameSlug, getParticipants(slug))
  }
  return NextResponse.json({ matches: getMatches(slug) })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const user = await getRole()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const matches = getMatches(slug).filter(m => m.id !== id)
  saveMatches(slug, matches)
  return NextResponse.json({ matches: getMatches(slug) })
}
