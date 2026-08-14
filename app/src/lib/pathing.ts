import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Pathing Dots and Boxes: two boards at once. Every swap on the left board
// draws a line on the right one, and the dots and boxes result feeds back into
// the colours you are trying to line up.

const PATH = join(process.cwd(), 'pathing.json')

export const SIZE = 4                  // the board is A to D by 1 to 4
export const LINE = 4                  // four of your colour in a row wins
export const TURN_MS = 120_000         // two minutes an action, refreshed by a box
export const RESERVE_MS = 300_000

export type Colour = 'red' | 'blue' | 'white'
export type PdbPhase = 'setup' | 'live' | 'convert' | 'finished'

/** The layout the reference art starts from. The host can redraw it. */
export const DEFAULT_BOARD: Colour[] = [
  'blue', 'red', 'white', 'blue',
  'red', 'white', 'white', 'red',
  'blue', 'white', 'white', 'blue',
  'red', 'white', 'blue', 'red',
]

export interface PdbLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'box' | 'round' | 'end'
}

export interface PathingGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  /** the player the advantage lets pick who starts */
  starter: string | null
  colours: Record<string, Colour>
  phase: PdbPhase
  round: number
  board: Colour[]
  /** which player owns each filled edge, keyed by the two cells it joins */
  edges: Record<string, string>
  /** which player closed each of the nine boxes */
  boxes: (string | null)[]
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  /** the player who lost the support board and owes a square */
  owes: string | null
  /** who moved last, because they open the next round */
  lastMover: string | null
  winner: string | null
  log: PdbLogEntry[]
  createdAt: string
}

function readAll(): Record<string, PathingGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, PathingGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): PathingGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: PathingGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): PathingGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: PathingGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null, starter: null,
    colours: {},
    phase: 'setup',
    round: 0,
    board: [...DEFAULT_BOARD],
    edges: {},
    boxes: Array(9).fill(null),
    turn: null, turnStartedAt: null, reserveMs: {},
    owes: null, lastMover: null, winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: PathingGame): PathingGame {
  return {
    ...game,
    phase: 'setup', round: 0,
    board: [...DEFAULT_BOARD], edges: {}, boxes: Array(9).fill(null),
    turn: null, turnStartedAt: null, reserveMs: {},
    owes: null, lastMover: null, winner: null, log: [],
  }
}

// ---------- the geometry ----------

export const cellName = (index: number): string =>
  `${String.fromCharCode(65 + (index % SIZE))}${Math.floor(index / SIZE) + 1}`

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function areNeighbours(a: number, b: number): boolean {
  const rowA = Math.floor(a / SIZE)
  const rowB = Math.floor(b / SIZE)
  const colA = a % SIZE
  const colB = b % SIZE
  return Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1
}

/** Every line that can be drawn between two neighbouring cells. */
export function allEdges(): string[] {
  const keys: string[] = []
  for (let cell = 0; cell < SIZE * SIZE; cell++) {
    const row = Math.floor(cell / SIZE)
    const col = cell % SIZE
    if (col + 1 < SIZE) keys.push(edgeKey(cell, cell + 1))
    if (row + 1 < SIZE) keys.push(edgeKey(cell, cell + SIZE))
  }
  return keys
}

/** The four lines that close a box, numbered left to right and top to bottom. */
export function boxEdges(box: number): string[] {
  const row = Math.floor(box / (SIZE - 1))
  const col = box % (SIZE - 1)
  const topLeft = row * SIZE + col
  return [
    edgeKey(topLeft, topLeft + 1),
    edgeKey(topLeft + SIZE, topLeft + SIZE + 1),
    edgeKey(topLeft, topLeft + SIZE),
    edgeKey(topLeft + 1, topLeft + 1 + SIZE),
  ]
}

function log(game: PathingGame, kind: PdbLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: PathingGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: PathingGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function colourOf(game: PathingGame, player: string): Colour {
  return game.colours[player] ?? 'white'
}

export function ownerOfColour(game: PathingGame, colour: Colour): string | null {
  return duelists(game).find(p => game.colours[p] === colour) ?? null
}

export function boxesWon(game: PathingGame, player: string): number {
  return game.boxes.filter(owner => owner === player).length
}

/** Four of one colour down a row or a column, which on this board is all of it. */
export function hasLine(board: Colour[], colour: Colour): boolean {
  if (colour === 'white') return false
  for (let i = 0; i < SIZE; i++) {
    const row = board.slice(i * SIZE, i * SIZE + SIZE)
    if (row.every(c => c === colour)) return true
    const column = Array.from({ length: SIZE }, (_, r) => board[r * SIZE + i])
    if (column.every(c => c === colour)) return true
  }
  return false
}

export function countOf(board: Colour[], colour: Colour): number {
  return board.filter(c => c === colour).length
}

// ---------- the game ----------

export function startGame(game: PathingGame, first: string): PathingGame {
  const [a, b] = duelists(game)
  game.colours = { [a]: 'red', [b]: 'blue' }
  game.phase = 'live'
  game.round = 1
  game.board = [...DEFAULT_BOARD]
  game.edges = {}
  game.boxes = Array(9).fill(null)
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  game.lastMover = null
  log(game, 'setup', `Игра началась. ${a} играет красными, ${b} синими. Первым ходит ${first}.`)
  return game
}

function finish(game: PathingGame, winner: string, reason: string): PathingGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

/** A round is over once every line between two cells has been drawn. */
function roundOver(game: PathingGame): boolean {
  return allEdges().every(key => game.edges[key])
}

function startRound(game: PathingGame): void {
  game.round += 1
  game.edges = {}
  game.boxes = Array(9).fill(null)
  game.turn = game.lastMover
  game.turnStartedAt = new Date().toISOString()
  game.owes = null
  game.phase = 'live'
  log(game, 'round', `Раунд ${game.round}. Первым ходит ${game.turn}.`)
}

function endRound(game: PathingGame): PathingGame {
  const [a, b] = duelists(game)
  const mine = boxesWon(game, a)
  const theirs = boxesWon(game, b)
  const loser = mine === theirs ? other(game, game.lastMover ?? a) : mine > theirs ? b : a
  log(game, 'round', `Раунд ${game.round}: коробки ${a} ${mine}, ${b} ${theirs}. Отдаёт клетку ${loser}.`)
  game.owes = loser
  game.phase = 'convert'
  game.turn = loser
  game.turnStartedAt = new Date().toISOString()
  return game
}

function chargeReserve(game: PathingGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: PathingGame): { player: string; deadline: number } | null {
  if (!game.turn || !game.turnStartedAt || game.phase === 'finished') return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

export function applyClock(game: PathingGame, now = Date.now()): PathingGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

/**
 * Whether the board is now won. Both colours can line up on the same move, and
 * then it goes to whoever holds more squares, and failing that to the mover.
 */
function decide(game: PathingGame, mover: string): PathingGame | null {
  const mine = colourOf(game, mover)
  const rival = other(game, mover)
  const theirs = colourOf(game, rival)
  const myLine = hasLine(game.board, mine)
  const theirLine = hasLine(game.board, theirs)

  if (myLine && theirLine) {
    const myCount = countOf(game.board, mine)
    const theirCount = countOf(game.board, theirs)
    const champion = myCount >= theirCount ? mover : rival
    return finish(game, champion, 'линии сложились одновременно')
  }
  if (myLine) return finish(game, mover, 'четыре в ряд')
  if (theirLine) return finish(game, rival, 'четыре в ряд')
  return null
}

/**
 * One swap: the two cells trade colours, the line between them is drawn, and
 * closing a box is worth another go.
 */
export function swap(game: PathingGame, player: string, a: number, b: number): PathingGame {
  chargeReserve(game, Date.now())
  const key = edgeKey(a, b)
  const board = [...game.board]
  const keep = board[a]
  board[a] = board[b]
  board[b] = keep
  game.board = board
  game.edges = { ...game.edges, [key]: player }
  game.lastMover = player
  log(game, 'move', `${player}: ${cellName(a)} и ${cellName(b)} меняются местами.`)

  let closed = 0
  game.boxes = game.boxes.map((owner, box) => {
    if (owner) return owner
    if (!boxEdges(box).every(edge => game.edges[edge])) return owner
    closed += 1
    return player
  })
  if (closed > 0) log(game, 'box', `${player} закрывает коробок: ${closed}. Ход продолжается.`)

  // a line finished by this swap ends the game at once
  const decided = decide(game, player)
  if (decided) return decided

  if (roundOver(game)) return endRound(game)
  // closing a box hands the same player another turn
  game.turn = closed > 0 ? player : other(game, player)
  game.turnStartedAt = new Date().toISOString()
  return game
}

/** The player who lost the support board hands a square to their opponent. */
export function convert(game: PathingGame, player: string, cell: number): PathingGame {
  chargeReserve(game, Date.now())
  const board = [...game.board]
  const rivalColour = colourOf(game, other(game, player))
  const whiteLeft = board.some(c => c === 'white')

  if (whiteLeft) {
    board[cell] = rivalColour
    log(game, 'round', `${player} отдаёт ${cellName(cell)} сопернику.`)
  } else {
    board[cell] = 'white'
    log(game, 'round', `${player} обесцвечивает свою ${cellName(cell)}: белых клеток не осталось.`)
  }
  game.board = board

  const decided = decide(game, player)
  if (decided) return decided
  startRound(game)
  return game
}

export function legalConversions(game: PathingGame, player: string): number[] {
  const whites = game.board.flatMap((c, i) => (c === 'white' ? [i] : []))
  if (whites.length > 0) return whites
  const own = colourOf(game, player)
  return game.board.flatMap((c, i) => (c === own ? [i] : []))
}

// ---------- what a viewer sees ----------

export interface PdbView {
  id: string
  name: string
  phase: PdbPhase
  ec: string | null
  opponent: string | null
  colours: Record<string, Colour>
  round: number
  board: Colour[]
  edges: Record<string, string>
  boxes: (string | null)[]
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  owes: string | null
  boxCounts: Record<string, number>
  legalCells: number[]
  winner: string | null
  isDuelist: boolean
  myColour: Colour | null
  log: PdbLogEntry[]
}

export function viewFor(game: PathingGame, username: string): PdbView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    colours: game.colours,
    round: game.round,
    board: game.board,
    edges: game.edges,
    boxes: game.boxes,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    owes: game.owes,
    boxCounts: Object.fromEntries(duelists(game).map(p => [p, boxesWon(game, p)])),
    legalCells: game.phase === 'convert' && game.owes === username
      ? legalConversions(game, username)
      : [],
    winner: game.winner,
    isDuelist,
    myColour: isDuelist ? colourOf(game, username) : null,
    log: game.log,
  }
}
