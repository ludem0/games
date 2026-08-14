import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Domino Black and White: dominoes fall into a bowl shaped grid, one half of
// each hidden, and three in a row summing to a multiple of five scores.

const PATH = join(process.cwd(), 'dominobw.json')

export const COLUMNS = 9               // A to I
export const ROWS = 9                  // R to Z
export const TURN_MS = 120_000
export const RESERVE_MS = 600_000
export const SCORING_SUMS = [0, 5, 10, 15]
export const BONUS_SUMS = [0, 15]

export type DbwPhase = 'setup' | 'live' | 'finished'
/** the four things a placement can be told it hit */
export type Condition = 'H' | 'V' | 'D' | 'B'

export interface Domino {
  id: string
  a: number
  b: number
}

/** Every combination from 0-0 up to 5-5, which is twenty one of them. */
export function fullSet(): Domino[] {
  const set: Domino[] = []
  for (let a = 0; a <= 5; a++) {
    for (let b = a; b <= 5; b++) set.push({ id: `${a}${b}`, a, b })
  }
  return set
}

export interface Half {
  player: string
  value: number
  hidden: boolean
  dominoId: string
}

export interface DbwPlacement {
  player: string
  dominoId: string
  cells: number[]
  hiddenCell: number | null
  conditions: Condition[]
  points: number
}

export interface DbwLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'score' | 'end'
}

export interface DominoBwGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  phase: DbwPhase
  /** what sits on each square of the bowl, indexed row * COLUMNS + column */
  cells: (Half | null)[]
  hands: Record<string, string[]>
  points: Record<string, number>
  placements: DbwPlacement[]
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  lastPlacer: string | null
  winner: string | null
  log: DbwLogEntry[]
  createdAt: string
}

// ---------- the bowl ----------

/** The top row runs the full width, the body is narrower, the floor narrower still. */
export function isCell(col: number, row: number): boolean {
  if (col < 0 || col >= COLUMNS || row < 0 || row >= ROWS) return false
  if (row === 0) return true
  if (row === ROWS - 1) return col >= 2 && col <= 6
  return col >= 1 && col <= 7
}

export const indexOf = (col: number, row: number): number => row * COLUMNS + col
export const colOf = (index: number): number => index % COLUMNS
export const rowOf = (index: number): number => Math.floor(index / COLUMNS)
export const cellName = (index: number): string =>
  `${String.fromCharCode(65 + colOf(index))}${String.fromCharCode(82 + rowOf(index))}`

/** The two overhanging corners need company before anything may sit on them. */
export function cornerAllowed(cells: (Half | null)[], index: number): boolean {
  const filled = (col: number, row: number) => isCell(col, row) && cells[indexOf(col, row)] != null
  if (index === indexOf(0, 0)) return filled(1, 1) || filled(2, 0)
  if (index === indexOf(COLUMNS - 1, 0)) return filled(7, 1) || filled(6, 0)
  return true
}

function free(cells: (Half | null)[], col: number, row: number): boolean {
  // the space above the bowl is open, which is where a domino comes in from
  if (row < 0) return col >= 0 && col < COLUMNS
  return isCell(col, row) && cells[indexOf(col, row)] == null
}

/**
 * A domino falls in without turning, so a placement is legal when a path of
 * sideways and downward steps reaches it, and something stops it there.
 */
export function canPlace(
  cells: (Half | null)[], col: number, row: number, vertical: boolean,
): boolean {
  const covers = (c: number, r: number): [number, number][] =>
    vertical ? [[c, r], [c, r + 1]] : [[c, r], [c + 1, r]]

  const fits = (c: number, r: number): boolean => covers(c, r).every(([x, y]) => free(cells, x, y))
  if (!fits(col, row)) return false
  if (!covers(col, row).every(([x, y]) => isCell(x, y))) return false
  if (!covers(col, row).every(([x, y]) => cornerAllowed(cells, indexOf(x, y)))) return false

  // gravity: it has to be resting on the floor or on something already there
  const resting = covers(col, row).some(([x, y]) => !free(cells, x, y + 1) && !(y + 1 < 0))
  if (!resting) return false

  // and it has to be able to get there from above
  const start: [number, number][] = []
  for (let c = 0; c < COLUMNS; c++) {
    if (fits(c, -2)) start.push([c, -2])
  }
  const seen = new Set<string>()
  const queue = [...start]
  while (queue.length > 0) {
    const [c, r] = queue.shift()!
    const key = `${c},${r}`
    if (seen.has(key)) continue
    seen.add(key)
    if (c === col && r === row) return true
    for (const [nc, nr] of [[c, r + 1], [c - 1, r], [c + 1, r]] as [number, number][]) {
      if (nr > ROWS || nc < -1 || nc > COLUMNS) continue
      if (fits(nc, nr) && !seen.has(`${nc},${nr}`)) queue.push([nc, nr])
    }
  }
  return false
}

// ---------- scoring ----------

const DIRECTIONS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]]

function valueAt(cells: (Half | null)[], col: number, row: number): number | null {
  if (!isCell(col, row)) return null
  return cells[indexOf(col, row)]?.value ?? null
}

/**
 * Which of the four conditions a placement hit. Hidden halves count towards a
 * sum exactly like the visible ones.
 */
export function conditionsFor(cells: (Half | null)[], placed: number[]): Condition[] {
  const hit = new Set<Condition>()
  let bonus = false

  for (const index of placed) {
    const col = colOf(index)
    const row = rowOf(index)
    for (const [dx, dy] of DIRECTIONS) {
      // the three windows of three that contain this square
      for (let offset = -2; offset <= 0; offset++) {
        const values = [0, 1, 2].map(step => valueAt(
          cells, col + (offset + step) * dx, row + (offset + step) * dy))
        if (values.some(v => v == null)) continue
        const sum = values.reduce((total: number, v) => total + (v ?? 0), 0)
        if (!SCORING_SUMS.includes(sum)) continue
        hit.add(dy === 0 ? 'H' : dx === 0 ? 'V' : 'D')
        if (BONUS_SUMS.includes(sum)) bonus = true
      }
    }
  }
  if (bonus) hit.add('B')
  return (['H', 'V', 'D', 'B'] as Condition[]).filter(c => hit.has(c))
}

// ---------- storage ----------

function readAll(): Record<string, DominoBwGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, DominoBwGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): DominoBwGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: DominoBwGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): DominoBwGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: DominoBwGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    cells: Array(COLUMNS * ROWS).fill(null),
    hands: {}, points: {}, placements: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    lastPlacer: null, winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: DominoBwGame): DominoBwGame {
  return {
    ...game,
    phase: 'setup',
    cells: Array(COLUMNS * ROWS).fill(null),
    hands: {}, points: {}, placements: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    lastPlacer: null, winner: null, log: [],
  }
}

// ---------- the game ----------

export function duelists(game: DominoBwGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: DominoBwGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

function log(game: DominoBwGame, kind: DbwLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function startGame(game: DominoBwGame, first: string): DominoBwGame {
  const ids = fullSet().map(d => d.id)
  game.phase = 'live'
  game.cells = Array(COLUMNS * ROWS).fill(null)
  game.hands = Object.fromEntries(duelists(game).map(p => [p, [...ids]]))
  game.points = Object.fromEntries(duelists(game).map(p => [p, 0]))
  game.placements = []
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  game.lastPlacer = null
  log(game, 'setup', `Игра началась, первым ходит ${first}. У каждого 21 домино.`)
  return game
}

function finish(game: DominoBwGame, winner: string, reason: string): DominoBwGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

/** Any placement at all still open to this player. */
export function hasMove(game: DominoBwGame, player: string): boolean {
  if ((game.hands[player] ?? []).length === 0) return false
  for (let row = -1; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      if (canPlace(game.cells, col, row, true)) return true
      if (canPlace(game.cells, col, row, false)) return true
    }
  }
  return false
}

function endByCount(game: DominoBwGame, reason: string): DominoBwGame {
  const [a, b] = duelists(game)
  const mine = game.points[a] ?? 0
  const theirs = game.points[b] ?? 0
  if (mine === theirs) {
    return finish(game, game.lastPlacer ?? a, `${reason}, поровну очков, решает последний ход`)
  }
  return finish(game, mine > theirs ? a : b, reason)
}

function chargeReserve(game: DominoBwGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: DominoBwGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

export function applyClock(game: DominoBwGame, now = Date.now()): DominoBwGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

/**
 * Puts a domino down. The first cell takes the first number, and one of the
 * two may be hidden, though a hidden number still counts towards every sum.
 */
export function place(
  game: DominoBwGame,
  player: string,
  dominoId: string,
  col: number,
  row: number,
  vertical: boolean,
  swapped: boolean,
  hideSecond: boolean,
): DominoBwGame {
  chargeReserve(game, Date.now())
  const domino = fullSet().find(d => d.id === dominoId)!
  const first = swapped ? domino.b : domino.a
  const second = swapped ? domino.a : domino.b
  const cells = vertical
    ? [indexOf(col, row), indexOf(col, row + 1)]
    : [indexOf(col, row), indexOf(col + 1, row)]

  const board = [...game.cells]
  board[cells[0]] = { player, value: first, hidden: !hideSecond, dominoId }
  board[cells[1]] = { player, value: second, hidden: hideSecond, dominoId }
  game.cells = board
  game.hands = { ...game.hands, [player]: (game.hands[player] ?? []).filter(id => id !== dominoId) }
  game.lastPlacer = player

  const conditions = conditionsFor(board, cells)
  const points = conditions.length
  game.points = { ...game.points, [player]: (game.points[player] ?? 0) + points }
  game.placements = [...game.placements, {
    player, dominoId, cells, hiddenCell: hideSecond ? cells[1] : cells[0], conditions, points,
  }]

  log(game, 'move', `${player} кладёт ${dominoId} на ${cells.map(cellName).join(' и ')}.`)
  if (points > 0) log(game, 'score', `${player}: ${conditions.join('')} — плюс ${points}.`)

  const rival = other(game, player)
  // the game stops when nobody can go on
  if (!hasMove(game, rival)) {
    return hasMove(game, player)
      ? endByCount(game, `${rival} больше не может ходить`)
      : endByCount(game, 'ходов больше нет')
  }
  game.turn = rival
  game.turnStartedAt = new Date().toISOString()
  return game
}

// ---------- what a viewer sees ----------

export interface DbwCellView {
  /** null while the half is hidden from this viewer */
  value: number | null
  /** even is black, odd is white, and that much is public even when hidden */
  black: boolean
  hidden: boolean
  owner: string
}

export interface DbwView {
  id: string
  name: string
  phase: DbwPhase
  ec: string | null
  opponent: string | null
  cells: (DbwCellView | null)[]
  myHand: string[]
  handSizes: Record<string, number>
  points: Record<string, number>
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  lastPlacement: DbwPlacement | null
  winner: string | null
  isDuelist: boolean
  log: DbwLogEntry[]
}

export function viewFor(game: DominoBwGame, username: string, isAdmin: boolean): DbwView {
  const limit = deadlineOf(game)
  const over = game.phase === 'finished'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    cells: game.cells.map(half => {
      if (!half) return null
      const open = !half.hidden || over || isAdmin || half.player === username
      return {
        value: open ? half.value : null,
        black: half.value % 2 === 0,
        hidden: half.hidden,
        owner: half.player,
      }
    }),
    myHand: game.hands[username] ?? [],
    handSizes: Object.fromEntries(duelists(game).map(p => [p, (game.hands[p] ?? []).length])),
    points: game.points,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    lastPlacement: game.placements[game.placements.length - 1] ?? null,
    winner: game.winner,
    isDuelist: duelists(game).includes(username),
    log: game.log,
  }
}
