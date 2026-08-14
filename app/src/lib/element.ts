import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Element: two sages on an eleven by eleven board, walling each other in with
// four kinds of stone until one of them has nowhere left to step.

const PATH = join(process.cwd(), 'element.json')

export const SIZE = 11
export const DRAW = 4
export const EARTH_MAX = 2
export const WIND_MAX = 4
export const TURN_MS = 300_000
export const RESERVE_MS = 600_000

export type Stone = 'fire' | 'wind' | 'earth' | 'water'
export const STONES: Stone[] = ['fire', 'wind', 'earth', 'water']
export const STONE_NAMES: Record<Stone, string> = {
  fire: 'огонь', wind: 'ветер', earth: 'земля', water: 'вода',
}

/** Fire covers wind, wind covers earth, earth covers water, water covers fire. */
export const REPLACES: Record<Stone, Stone> = {
  fire: 'wind', wind: 'earth', earth: 'water', water: 'fire',
}

export type Cell = { stone: Stone; height: number } | null
export type ElPhase = 'setup' | 'live' | 'finished'

export interface ElTurn {
  /** stones rolled this turn and not yet placed */
  pending: Stone[]
  /** steps still owed to the sage */
  moves: number
  /** wind stones already used for a jump this turn */
  jumped: number[]
  drawn: boolean
}

export interface ElLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'stone' | 'effect' | 'end'
}

export interface ElementGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  phase: ElPhase
  board: Cell[]
  sages: Record<string, number>
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  current: ElTurn
  winner: string | null
  log: ElLogEntry[]
  createdAt: string
}

// ---------- the board ----------

export const indexOf = (col: number, row: number): number => row * SIZE + col
export const colOf = (index: number): number => index % SIZE
export const rowOf = (index: number): number => Math.floor(index / SIZE)
export const squareName = (index: number): string =>
  `${String.fromCharCode(65 + colOf(index))}${rowOf(index) + 1}`

export function onBoard(col: number, row: number): boolean {
  return col >= 0 && col < SIZE && row >= 0 && row < SIZE
}

export function freshBoard(): Cell[] {
  return Array(SIZE * SIZE).fill(null)
}

/** An earth stone stacked to two is a mountain and cannot be blown away. */
export function isMountain(cell: Cell): boolean {
  return !!cell && cell.stone === 'earth' && cell.height >= EARTH_MAX
}

// ---------- storage ----------

function readAll(): Record<string, ElementGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, ElementGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): ElementGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: ElementGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

function blankTurn(): ElTurn {
  return { pending: [], moves: 0, jumped: [], drawn: false }
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): ElementGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: ElementGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    board: freshBoard(),
    sages: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    current: blankTurn(),
    winner: null, log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: ElementGame): ElementGame {
  return {
    ...game,
    phase: 'setup', board: freshBoard(), sages: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    current: blankTurn(), winner: null, log: [],
  }
}

function log(game: ElementGame, kind: ElLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: ElementGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: ElementGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function sageAt(game: ElementGame, index: number): string | null {
  return duelists(game).find(p => game.sages[p] === index) ?? null
}

// ---------- moving ----------

const DIRECTIONS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/**
 * Where a sage may step. A square with any stone is shut, and a diagonal
 * between two mountains is shut as well.
 */
export function stepsFor(game: ElementGame, player: string): number[] {
  const from = game.sages[player]
  if (from == null) return []
  const col = colOf(from)
  const row = rowOf(from)
  const out: number[] = []

  for (const [dc, dr] of DIRECTIONS) {
    const c = col + dc
    const r = row + dr
    if (!onBoard(c, r)) continue
    const target = indexOf(c, r)
    if (game.board[target]) continue
    if (sageAt(game, target)) continue
    // a diagonal squeeze between two mountains is blocked
    if (dc !== 0 && dr !== 0) {
      const sideA = game.board[indexOf(col + dc, row)]
      const sideB = game.board[indexOf(col, row + dr)]
      if (isMountain(sideA) && isMountain(sideB)) continue
    }
    out.push(target)
  }
  return out
}

/**
 * Jumps are free. A sage clears a line of wind stones in one of the eight
 * directions, landing on the first empty square past them, and a whirlwind
 * carries them as far as it is tall.
 */
export function jumpsFor(game: ElementGame, player: string): { to: number; over: number[] }[] {
  const from = game.sages[player]
  if (from == null) return []
  const col = colOf(from)
  const row = rowOf(from)
  const out: { to: number; over: number[] }[] = []

  for (const [dc, dr] of DIRECTIONS) {
    const over: number[] = []
    let distance = 0
    let c = col + dc
    let r = row + dr

    while (onBoard(c, r)) {
      const index = indexOf(c, r)
      const cell = game.board[index]
      if (!cell || cell.stone !== 'wind') break
      if (game.current.jumped.includes(index)) break
      over.push(index)
      // a stack carries the sage as far as it is tall
      distance += cell.height
      c += dc
      r += dr
    }
    if (over.length === 0) continue

    // a whirlwind throws the sage as far as it is tall, but a jump must at the
    // very least clear the wind it went over
    const travel = Math.max(distance, over.length + 1)
    const landC = col + dc * travel
    const landR = row + dr * travel
    if (!onBoard(landC, landR)) continue
    const landing = indexOf(landC, landR)
    if (game.board[landing] || sageAt(game, landing)) continue
    out.push({ to: landing, over })
  }
  return out
}

export function canMoveAtAll(game: ElementGame, player: string): boolean {
  return stepsFor(game, player).length > 0 || jumpsFor(game, player).length > 0
}

// ---------- placing ----------

export function canPlace(game: ElementGame, stone: Stone, index: number): boolean {
  if (index < 0 || index >= SIZE * SIZE) return false
  if (sageAt(game, index)) return false
  const cell = game.board[index]
  if (!cell) return true
  // stacking your own kind, or covering the colour this stone beats
  if (cell.stone === stone) {
    if (stone === 'earth') return cell.height < EARTH_MAX
    if (stone === 'wind') return cell.height < WIND_MAX
    return false
  }
  if (isMountain(cell)) return false
  return REPLACES[stone] === cell.stone
}

/**
 * Fire reaches past a neighbour of its own kind and lights the square beyond,
 * as long as that square is empty or holds wind. Stones lit this way do not
 * spread again.
 */
export function spreadFire(game: ElementGame, index: number): number[] {
  const col = colOf(index)
  const row = rowOf(index)
  const lit: number[] = []

  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    let c = col + dc
    let r = row + dr
    if (!onBoard(c, r)) continue
    const neighbour = game.board[indexOf(c, r)]
    if (!neighbour || neighbour.stone !== 'fire') continue

    // walk past any further fire in the same line
    while (onBoard(c, r) && game.board[indexOf(c, r)]?.stone === 'fire') {
      c += dc
      r += dr
    }
    if (!onBoard(c, r)) continue
    const target = indexOf(c, r)
    if (sageAt(game, target)) continue
    const cell = game.board[target]
    if (cell && cell.stone !== 'wind') continue
    game.board[target] = { stone: 'fire', height: 1 }
    lit.push(target)
  }
  return lit
}

/** The straight run of water a new stone joins, itself included. */
export function riverFrom(game: ElementGame, index: number): number[][] {
  const col = colOf(index)
  const row = rowOf(index)
  const rivers: number[][] = []

  for (const [dc, dr] of [[1, 0], [0, 1]] as [number, number][]) {
    const line = [index]
    for (const sign of [1, -1]) {
      let c = col + dc * sign
      let r = row + dr * sign
      while (onBoard(c, r) && game.board[indexOf(c, r)]?.stone === 'water') {
        if (sign > 0) line.push(indexOf(c, r))
        else line.unshift(indexOf(c, r))
        c += dc * sign
        r += dr * sign
      }
    }
    if (line.length > 1) rivers.push(line)
  }
  return rivers
}

/**
 * A river shifts one square for every stone in it, carrying the whole line.
 * Fire in the way is washed out; anything else stops it, which makes the move
 * illegal rather than short.
 */
export function moveRiver(
  game: ElementGame, river: number[], direction: [number, number],
): { ok: boolean; problem?: string } {
  const [dc, dr] = direction
  const distance = river.length
  const moving = new Set(river)

  for (const index of river) {
    const c = colOf(index) + dc * distance
    const r = rowOf(index) + dr * distance
    if (!onBoard(c, r)) return { ok: false, problem: 'Река ушла бы за край доски' }
  }
  // every square the line crosses has to be clear of everything but fire
  for (const index of river) {
    for (let step = 1; step <= distance; step++) {
      const c = colOf(index) + dc * step
      const r = rowOf(index) + dr * step
      const target = indexOf(c, r)
      if (moving.has(target)) continue
      if (sageAt(game, target)) return { ok: false, problem: 'На пути реки стоит мудрец' }
      const cell = game.board[target]
      if (cell && cell.stone !== 'fire') return { ok: false, problem: 'Река упирается в камень' }
    }
  }

  const carried = river.map(index => game.board[index])
  for (const index of river) game.board[index] = null
  river.forEach((index, i) => {
    const target = indexOf(colOf(index) + dc * distance, rowOf(index) + dr * distance)
    game.board[target] = carried[i]
  })
  return { ok: true }
}

// ---------- the turn ----------

function chargeReserve(game: ElementGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: ElementGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

function finish(game: ElementGame, winner: string, reason: string): ElementGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

export function applyClock(game: ElementGame, now = Date.now()): ElementGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

export function startGame(game: ElementGame, first: string, sages: Record<string, number>): ElementGame {
  game.board = freshBoard()
  game.sages = sages
  game.phase = 'live'
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  game.current = blankTurn()
  log(game, 'setup', `Игра началась, первым ходит ${first}.`)
  return game
}

function randomStone(): Stone {
  return STONES[Math.floor(Math.random() * STONES.length)]
}

/** Fewer stones drawn means more steps: the four are traded one for one. */
export function drawStones(game: ElementGame, player: string, count: number): ElementGame {
  chargeReserve(game, Date.now())
  const taken = Math.max(0, Math.min(DRAW, Math.floor(count)))
  game.current = {
    pending: Array.from({ length: taken }, randomStone),
    // one step always comes free, and every stone left undrawn adds another
    moves: 1 + (DRAW - taken),
    jumped: [],
    drawn: true,
  }
  log(game, 'stone', `${player} берёт ${taken} камней: ${game.current.pending.map(s => STONE_NAMES[s]).join(', ') || 'ни одного'}`)
  return game
}

export function step(game: ElementGame, player: string, to: number): ElementGame {
  chargeReserve(game, Date.now())
  game.sages = { ...game.sages, [player]: to }
  game.current.moves -= 1
  log(game, 'move', `${player} шагает на ${squareName(to)}`)
  return game
}

export function jump(game: ElementGame, player: string, to: number, over: number[]): ElementGame {
  chargeReserve(game, Date.now())
  game.sages = { ...game.sages, [player]: to }
  game.current.jumped = [...game.current.jumped, ...over]
  log(game, 'move', `${player} перепрыгивает ветер на ${squareName(to)}`)
  return game
}

export function placeStone(
  game: ElementGame, player: string, stone: Stone, index: number, riverDirection?: [number, number],
): { game: ElementGame; problem?: string } {
  chargeReserve(game, Date.now())
  const cell = game.board[index]
  const stacking = cell && cell.stone === stone

  game.board[index] = {
    stone,
    height: stacking ? cell!.height + 1 : 1,
  }

  if (stone === 'fire') {
    const lit = spreadFire(game, index)
    if (lit.length > 0) log(game, 'effect', `Огонь перекинулся на ${lit.map(squareName).join(', ')}`)
  }

  if (stone === 'water') {
    const rivers = riverFrom(game, index)
    if (rivers.length > 0) {
      const river = rivers[0]
      if (!riverDirection) {
        return { game, problem: 'Укажите, куда течёт река' }
      }
      const moved = moveRiver(game, river, riverDirection)
      if (!moved.ok) return { game, problem: moved.problem }
      log(game, 'effect', `Река из ${river.length} камней сдвинулась`)
    }
  }

  const index2 = game.current.pending.indexOf(stone)
  if (index2 >= 0) {
    game.current = { ...game.current, pending: game.current.pending.filter((_, i) => i !== index2) }
  }
  log(game, 'stone', `${player} кладёт ${STONE_NAMES[stone]} на ${squareName(index)}`)
  return { game }
}

/** Ends the turn and checks whether the other sage is walled in. */
export function endTurn(game: ElementGame, player: string): ElementGame {
  const rival = other(game, player)
  game.current = blankTurn()
  if (!canMoveAtAll(game, rival)) {
    return finish(game, player, `${rival} не может сходить`)
  }
  game.turn = rival
  game.turnStartedAt = new Date().toISOString()
  return game
}

// ---------- what a viewer sees ----------

export interface ElView {
  id: string
  name: string
  phase: ElPhase
  ec: string | null
  opponent: string | null
  board: Cell[]
  sages: Record<string, number>
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  pending: Stone[]
  moves: number
  drawn: boolean
  steps: number[]
  jumps: { to: number; over: number[] }[]
  winner: string | null
  isDuelist: boolean
  log: ElLogEntry[]
}

export function viewFor(game: ElementGame, username: string): ElView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)
  const mine = game.turn === username && game.phase === 'live'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    board: game.board,
    sages: game.sages,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    // the stones you rolled are yours to see while you place them
    pending: mine ? game.current.pending : [],
    moves: mine ? game.current.moves : 0,
    drawn: mine ? game.current.drawn : false,
    steps: mine && game.current.moves > 0 ? stepsFor(game, username) : [],
    jumps: mine ? jumpsFor(game, username) : [],
    winner: game.winner,
    isDuelist,
    log: game.log,
  }
}
