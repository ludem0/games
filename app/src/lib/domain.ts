import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { SHAPES, SHAPE_COUNT, START_SHAPE, shapeById, type Placement } from './domainShapes'
import { BLUE, RED, checkPlacement, paintBoard, scoreBoard, type Ink, type Score } from './domainRaster'

// Domain: two players share out a pool of shapes, then stamp them over each
// other's half of the board. Whoever owns more of the picture at the end wins.

const PATH = join(process.cwd(), 'domain.json')

export const DRAFT_MS = 120_000
export const TURN_MS = 180_000
export const RESERVE_MS = 600_000
export const MAX_SKIPS = 2

export type DomainPhase = 'setup' | 'draft' | 'place' | 'finished'

export interface DomainLogEntry {
  at: string
  text: string
  kind: 'setup' | 'draft' | 'place' | 'end'
}

export interface DomainGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  /** the death match opponent, who also takes ties */
  opponent: string | null
  phase: DomainPhase
  /** which half of the board each duelist starts owning */
  ink: Record<string, Ink>
  draftTurn: string | null
  draftStartedAt: string | null
  skips: Record<string, number>
  taken: Record<string, string>
  placements: Placement[]
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  score: Score | null
  winner: string | null
  log: DomainLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, DomainGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, DomainGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): DomainGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: DomainGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

function log(game: DomainGame, kind: DomainLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export const duelists = (game: DomainGame): string[] =>
  [game.ec, game.opponent].filter((p): p is string => !!p)

const other = (game: DomainGame, player: string): string =>
  duelists(game).find(p => p !== player) as string

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): DomainGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: DomainGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    ink: {},
    draftTurn: null, draftStartedAt: null, skips: {},
    taken: {}, placements: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    score: null, winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: DomainGame): DomainGame {
  return {
    ...game,
    phase: 'setup', ink: {},
    draftTurn: null, draftStartedAt: null, skips: {},
    taken: {}, placements: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    score: null, winner: null, log: [],
  }
}

// ---------- hands ----------

export const heldBy = (game: DomainGame, player: string): number[] =>
  Object.entries(game.taken)
    .filter(([, owner]) => owner === player)
    .map(([id]) => Number(id))

export const placedIds = (game: DomainGame): number[] => game.placements.map(p => p.shapeId)

export const handOf = (game: DomainGame, player: string): number[] => {
  const gone = new Set(placedIds(game))
  return heldBy(game, player).filter(id => !gone.has(id))
}

export const poolLeft = (game: DomainGame): number[] =>
  SHAPES.map(s => s.id).filter(id => !game.taken[id])

const inkOf = (game: DomainGame) => (owner: string): Ink => game.ink[owner] ?? BLUE

// ---------- setting up ----------

export function setRoles(game: DomainGame, ec: string, opponent: string): DomainGame {
  game.ec = ec
  game.opponent = opponent
  game.ink = { [ec]: BLUE, [opponent]: RED }
  return game
}

export function startDraft(game: DomainGame, first: string): DomainGame {
  game.phase = 'draft'
  game.draftTurn = first
  game.draftStartedAt = new Date().toISOString()
  game.skips = Object.fromEntries(duelists(game).map(p => [p, 0]))
  log(game, 'setup', `Разбор фигур начат, первым выбирает ${first}.`)
  return game
}

// ---------- the clock ----------

export interface Limit { player: string; deadline: number }

export function deadlineOf(game: DomainGame): Limit | null {
  if (game.phase === 'draft' && game.draftTurn && game.draftStartedAt) {
    return { player: game.draftTurn, deadline: new Date(game.draftStartedAt).getTime() + DRAFT_MS }
  }
  if (game.phase === 'place' && game.turn && game.turnStartedAt) {
    const reserve = game.reserveMs[game.turn] ?? 0
    return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
  }
  return null
}

function chargeReserve(game: DomainGame, now: number): void {
  if (game.phase !== 'place' || !game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

function concede(game: DomainGame, loser: string, reason: string): DomainGame {
  game.phase = 'finished'
  game.winner = other(game, loser)
  game.draftTurn = null
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${game.winner} (${reason})`)
  return game
}

export function applyClock(game: DomainGame, now = Date.now()): DomainGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game

  if (game.phase === 'draft') {
    const skips = (game.skips[limit.player] ?? 0) + 1
    game.skips = { ...game.skips, [limit.player]: skips }
    log(game, 'draft', `${limit.player} не успел выбрать фигуру (${skips} из ${MAX_SKIPS}).`)
    if (skips >= MAX_SKIPS) return concede(game, limit.player, 'дважды пропустил выбор фигуры')
    return passDraft(game, limit.player)
  }

  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return concede(game, limit.player, 'кончилось время')
}

// ---------- drafting ----------

function passDraft(game: DomainGame, from: string): DomainGame {
  if (poolLeft(game).length === 0) return beginPlacing(game)
  game.draftTurn = other(game, from)
  game.draftStartedAt = new Date().toISOString()
  return game
}

export interface Problem { problem?: string }

export function draftPick(game: DomainGame, player: string, shapeId: number): Problem {
  if (game.phase !== 'draft') return { problem: 'Разбор фигур не идёт' }
  if (game.draftTurn !== player) return { problem: 'Сейчас выбирает соперник' }
  if (!shapeById(shapeId)) return { problem: 'Такой фигуры нет' }
  if (game.taken[shapeId]) return { problem: 'Эту фигуру уже забрали' }

  game.taken = { ...game.taken, [shapeId]: player }
  log(game, 'draft', `${player} забирает фигуру ${shapeId}`)
  passDraft(game, player)
  return {}
}

/** Test helper: shares out whatever is left of the pool so placing can be tried. */
export function autoDraft(game: DomainGame): Problem {
  if (game.phase !== 'draft') return { problem: 'Разбор фигур не идёт' }
  log(game, 'draft', 'Остаток пула разобран автоматически.')
  while (game.phase === 'draft') {
    const left = poolLeft(game)
    if (left.length === 0) {
      beginPlacing(game)
      break
    }
    const id = left[Math.floor(Math.random() * left.length)]
    const who = game.draftTurn as string
    game.taken = { ...game.taken, [id]: who }
    passDraft(game, who)
  }
  return {}
}

/** Whoever drafted the Start piece lays the first shape down. */
function beginPlacing(game: DomainGame): DomainGame {
  const first = game.taken[START_SHAPE] ?? duelists(game)[0]
  game.phase = 'place'
  game.draftTurn = null
  game.draftStartedAt = null
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  log(game, 'setup', `Все фигуры разобраны. Первым кладёт ${first}: у него фигура Start.`)
  return game
}

// ---------- placing ----------

export function boardOf(game: DomainGame): Uint8Array {
  return paintBoard(game.placements, inkOf(game))
}

export function place(game: DomainGame, player: string, shapeId: number, x: number, y: number, rot: number): Problem {
  if (game.phase !== 'place') return { problem: 'Выкладка не идёт' }
  if (game.turn !== player) return { problem: 'Сейчас не ваш ход' }
  if (!handOf(game, player).includes(shapeId)) return { problem: 'Этой фигуры у вас нет' }

  const placement: Placement = { shapeId, owner: player, x, y, rot }
  const problem = checkPlacement(boardOf(game), placement)
  if (problem) return { problem }

  chargeReserve(game, Date.now())
  game.placements = [...game.placements, placement]
  log(game, 'place', `${player} кладёт фигуру ${shapeId}`)

  const rival = other(game, player)
  if (handOf(game, rival).length === 0) {
    finish(game)
    return {}
  }

  game.turn = rival
  game.turnStartedAt = new Date().toISOString()
  return {}
}

function finish(game: DomainGame): DomainGame {
  const score = scoreBoard(boardOf(game))
  game.score = score
  game.phase = 'finished'
  game.turn = null
  game.turnStartedAt = null

  const blue = duelists(game).find(p => game.ink[p] === BLUE) as string
  const red = duelists(game).find(p => game.ink[p] === RED) as string
  // an exact draw goes to the death match opponent
  game.winner = score.blue > score.red ? blue : score.red > score.blue ? red : (game.opponent as string)
  log(game, 'end', `Синий ${score.blue}, красный ${score.red}. Победа: ${game.winner}`)
  return game
}

// ---------- what a viewer sees ----------

export interface DomainView {
  id: string
  name: string
  phase: DomainPhase
  ec: string | null
  opponent: string | null
  ink: Record<string, Ink>
  draftTurn: string | null
  skips: Record<string, number>
  taken: Record<string, string>
  pool: number[]
  placements: Placement[]
  hand: number[]
  rivalHand: number
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  score: Score | null
  winner: string | null
  isDuelist: boolean
  shapesTotal: number
  log: DomainLogEntry[]
}

export function viewFor(game: DomainGame, username: string): DomainView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)
  const rival = isDuelist ? other(game, username) : null

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    ink: game.ink,
    draftTurn: game.draftTurn,
    skips: game.skips,
    taken: game.taken,
    pool: poolLeft(game),
    placements: game.placements,
    hand: isDuelist ? handOf(game, username) : [],
    rivalHand: rival ? handOf(game, rival).length : 0,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    // the running tally stays hidden until the last shape is down
    score: game.phase === 'finished' ? game.score : null,
    winner: game.winner,
    isDuelist,
    shapesTotal: SHAPE_COUNT,
    log: game.log,
  }
}
