import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { resolveCycle, powerById, COLUMNS as POWER_COLUMNS } from './racePowers'

// Doubting Middle Elevator Race: a bluffing race up an eight by eight board.
// Finishing first or last loses, so everyone is aiming for the middle.

const PATH = join(process.cwd(), 'elevatorrace.json')

export const COLUMNS = 8
export const ROWS = 8
export const FINISH = 65               // one past the last square
export const PHASE_MS = 24 * 60 * 60 * 1000
export const CUT_EVERY = 5             // turns between the bottom row falling away
export const CUT_PENALTY = 5
export const CUT_PENALTY_CAP = 15      // the row penalty never takes more than this in total
export const BUST_PENALTY = 1
export const LIE_PENALTY = 3
export const LIFE_COST = 5
export const MAX_LIVES = 3
/** the left hand squares with a purple border: crossing one is worth a life */
export const PURPLE = [17, 33, 49]

export type RollerKind = 'coin' | 'spinner' | 'dice' | 'lotto'
export type RollValue = number | 'bust'
export type ErPhase = 'setup' | 'draft' | 'roll' | 'bluff' | 'finished'
export const DRAFT_CYCLES = 3

export const ROLLERS: RollerKind[] = ['coin', 'spinner', 'dice', 'lotto']
export const FACES: Record<Exclude<RollerKind, 'lotto'>, number[]> = {
  coin: [0, 1],
  spinner: [1, 3, 5],
  dice: [1, 2, 3, 4],
}
export const LOTTO_FACES: RollValue[] = ['bust', 2, 3, 4, 5, 6]

/** What each finishing place is worth, first and last going to the deathmatch. */
export const PRIZES: { psigems: number; clearOpal: boolean; deathmatch: boolean }[] = [
  { psigems: 0, clearOpal: false, deathmatch: true },
  { psigems: 3, clearOpal: true, deathmatch: false },
  { psigems: 4, clearOpal: false, deathmatch: false },
  { psigems: 4, clearOpal: false, deathmatch: false },
  { psigems: 2, clearOpal: false, deathmatch: false },
  { psigems: 2, clearOpal: false, deathmatch: false },
  { psigems: 3, clearOpal: false, deathmatch: false },
  { psigems: 3, clearOpal: false, deathmatch: false },
  { psigems: 3, clearOpal: true, deathmatch: false },
  { psigems: 0, clearOpal: false, deathmatch: true },
]

export interface Elevator {
  from: number
  to: number
}

/**
 * The board as read off the reference art. The host can correct any of these
 * before the race starts, since one wrong number changes the whole map.
 */
export const DEFAULT_ELEVATORS: Elevator[] = [
  { from: 16, to: 24 },
  { from: 14, to: 3 },
  { from: 20, to: 36 },
  { from: 22, to: 7 },
  { from: 28, to: 44 },
  { from: 34, to: 42 },
  { from: 45, to: 36 },
  { from: 53, to: 61 },
  { from: 56, to: 41 },
  { from: 60, to: 64 },
  { from: 62, to: 63 },
]

/** Everything the Edit column lets a player change about their own rollers. */
export interface ErConfig {
  coinFace?: number
  spinnerFaces?: number[]
  diceFifth?: number
  lottoRemoved?: RollValue[]
  /** faces turned negative, per roller */
  negatives?: Partial<Record<RollerKind, number[]>>
  /** Less removes one roller, More adds a second copy of one */
  removedRoller?: RollerKind
  extraRoller?: RollerKind
  /** Dash doubles the numbers on three rollers */
  doubled?: RollerKind[]
  /** Single picks one roller to take four of on the next reset */
  singleChoice?: RollerKind
}

export interface ErPlayer {
  space: number
  lives: number
  /** rollers still in hand this reset */
  hand: RollerKind[]
  /** lotto faces that have not come up since the last refill */
  lotto: RollValue[]
  /** how many times this player has lied since their last reset */
  lies: number
  /** claims made since the last reset, so the lie rule can be checked */
  claimsThisReset: number
  finishPlace: number | null
  cutPenaltyPaid: number
  powers: string[]
  config: ErConfig
  /** one time copies handed out by Reserve */
  reserve: RollerKind[]
  /** Insurance spends this once per reset */
  rerollUsed: boolean
  lastSingle?: RollerKind
}

export interface ErDraft {
  cycle: number
  deadline: string
  bids: Record<string, { power: string; amount: number } | null>
  notes: string[]
}

export interface ErTurnEntry {
  roller: RollerKind | null
  value: RollValue | null
  claim: RollValue | null
  challenge: string | null
}

export interface ErTurn {
  number: number
  phase: 'roll' | 'bluff'
  deadline: string
  entries: Record<string, ErTurnEntry>
  /** filled in when the turn resolves */
  moved: Record<string, { from: number; to: number; reason: string }> | null
  closedAt: string | null
}

export interface ErLogEntry {
  at: string
  text: string
  kind: 'setup' | 'roll' | 'bluff' | 'move' | 'board' | 'end'
}

export interface ElevatorRaceGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: ErPhase
  elevators: Elevator[]
  /** the lowest row still on the board, counting from one */
  floor: number
  /** every elevator turns around once somebody has finished */
  flipped: boolean
  players: Record<string, ErPlayer>
  draft: ErDraft | null
  turns: ErTurn[]
  finishOrder: string[]
  /** set once the prizes have been written into the season */
  paidOut?: boolean
  log: ErLogEntry[]
  createdAt: string
}

function readAll(): Record<string, ElevatorRaceGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, ElevatorRaceGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): ElevatorRaceGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: ElevatorRaceGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): ElevatorRaceGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: ElevatorRaceGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup',
    elevators: DEFAULT_ELEVATORS,
    floor: 1,
    flipped: false,
    players: {},
    draft: null,
    turns: [],
    finishOrder: [],
    log: [],
    createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: ElevatorRaceGame): ElevatorRaceGame {
  return {
    ...game,
    phase: 'setup', floor: 1, flipped: false,
    players: {}, draft: null, turns: [], finishOrder: [], log: [],
    paidOut: false,
  }
}

// ---------- the board ----------

/** Squares are numbered in a snake: row one runs right, row two runs back. */
export function rowOf(space: number): number {
  if (space <= 0) return 0
  if (space >= FINISH) return ROWS + 1
  return Math.ceil(space / COLUMNS)
}

/** Two rows up keeps the column, because the snake turns back on itself. */
export function rowsUp(space: number, rows: number): number {
  return space + rows * COLUMNS
}

export function lowestSpaceOn(floor: number): number {
  return (floor - 1) * COLUMNS + 1
}

/** An elevator counts as double when it spans two rows, and dies when it does not. */
export function elevatorSpan(elevator: Elevator): number {
  return Math.abs(rowOf(elevator.to) - rowOf(elevator.from))
}

function log(game: ElevatorRaceGame, kind: ErLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function players(game: ElevatorRaceGame): string[] {
  return Object.keys(game.players)
}

export function racing(game: ElevatorRaceGame): string[] {
  return players(game).filter(p => game.players[p].finishPlace == null)
}

// ---------- rolling ----------

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function has(player: ErPlayer | undefined, power: string): boolean {
  return !!player?.powers?.includes(power)
}

/** The faces a player's roller actually carries, after the Edit column. */
export function facesFor(player: ErPlayer, roller: RollerKind): RollValue[] {
  const config = player.config ?? {}
  let faces: RollValue[]

  if (roller === 'lotto') {
    faces = LOTTO_FACES.filter(f => !(config.lottoRemoved ?? []).includes(f))
  } else if (roller === 'coin') {
    faces = [0, config.coinFace ?? 1]
  } else if (roller === 'spinner') {
    faces = config.spinnerFaces ?? FACES.spinner
  } else {
    faces = config.diceFifth != null ? [...FACES.dice, config.diceFifth] : FACES.dice
  }

  const negatives = config.negatives?.[roller] ?? []
  const doubled = (config.doubled ?? []).includes(roller)
  return faces.map(face => {
    if (typeof face !== 'number') return face
    const scaled = doubled ? face * 2 : face
    return negatives.includes(face) ? -scaled : scaled
  })
}

/** Rolls a roller, taking the lotto's memory into account. */
export function rollFor(player: ErPlayer, roller: RollerKind): RollValue {
  const faces = facesFor(player, roller)
  if (roller !== 'lotto') return pick(faces)
  const left = player.lotto.filter(v => faces.includes(v))
  if (left.length === 0) player.lotto = [...faces]
  const value = pick(player.lotto.length > 0 ? player.lotto : faces)
  player.lotto = player.lotto.filter(v => v !== value)
  return value
}

/** The hand a player starts the race with, after Less and More. */
export function openingHand(player: ErPlayer): RollerKind[] {
  const config = player.config ?? {}
  const base = ROLLERS.filter(r => r !== config.removedRoller)
  return config.extraRoller ? [...base, config.extraRoller] : base
}

/** The hand a reset hands back. Single only ever applies to a reset. */
export function resetHand(player: ErPlayer): RollerKind[] {
  const config = player.config ?? {}
  if (has(player, 'single') && config.singleChoice && config.singleChoice !== player.lastSingle) {
    player.lastSingle = config.singleChoice
    return Array(4).fill(config.singleChoice)
  }
  player.lastSingle = undefined
  return openingHand(player)
}

/** Waste resets a roller early; everybody else empties their hand first. */
function resetDue(player: ErPlayer): boolean {
  return has(player, 'waste') ? player.hand.length <= 1 : player.hand.length === 0
}

export function startingLives(player: ErPlayer): number {
  if (has(player, 'waste')) return 3
  if (['detective', 'spy', 'silence', 'bandit'].some(p => has(player, p))) return 2
  return 1
}

/** Bandit may lie twice, once or not at all; everybody else owes exactly one. */
function lieRuleBroken(player: ErPlayer): boolean {
  if (has(player, 'bandit')) return player.lies > 2
  return player.lies !== 1
}

/**
 * Spends a roller. Running out returns all four, which is also the moment the
 * lie rule is settled.
 */
function useRoller(game: ElevatorRaceGame, name: string, roller: RollerKind, charge: Charge): void {
  const player = game.players[name]
  const index = player.hand.indexOf(roller)
  if (index >= 0) player.hand = player.hand.filter((_, i) => i !== index)
  if (!resetDue(player)) return

  // three rollers gone from the game leaves the lie rule unenforceable
  const stripped = ROLLERS.filter(r => facesFor(player, r).length === 0).length
  if (lieRuleBroken(player) && stripped < 3) {
    charge(name, LIE_PENALTY)
    log(game, 'bluff', `${name} нарушил правило лжи за сброс и теряет ${LIE_PENALTY} псигема.`)
  }
  player.hand = resetHand(player)
  player.lotto = facesFor(player, 'lotto')
  player.lies = 0
  player.claimsThisReset = 0
  player.rerollUsed = false
}

export type Charge = (player: string, amount: number) => void

// ---------- the turn ----------

function openTurn(game: ElevatorRaceGame, phase: 'roll' | 'bluff'): void {
  const number = phase === 'roll' ? game.turns.length + 1 : game.turns[game.turns.length - 1].number
  if (phase === 'bluff') {
    const turn = game.turns[game.turns.length - 1]
    turn.phase = 'bluff'
    turn.deadline = new Date(Date.now() + PHASE_MS).toISOString()
    game.phase = 'bluff'
    return
  }
  game.turns = [...game.turns, {
    number,
    phase: 'roll',
    deadline: new Date(Date.now() + PHASE_MS).toISOString(),
    entries: Object.fromEntries(racing(game).map(p => [p, {
      roller: null, value: null, claim: null, challenge: null,
    }])),
    moved: null,
    closedAt: null,
  }]
  game.phase = 'roll'
}

export function currentTurn(game: ElevatorRaceGame): ErTurn | null {
  return game.turns[game.turns.length - 1] ?? null
}

function blankPlayer(): ErPlayer {
  return {
    space: 0,
    lives: 1,
    hand: [...ROLLERS],
    lotto: [...LOTTO_FACES],
    lies: 0,
    claimsThisReset: 0,
    finishPlace: null,
    cutPenaltyPaid: 0,
    powers: [],
    config: {},
    reserve: [],
    rerollUsed: false,
  }
}

/** The draft comes first: three cycles of sealed bids, a day each. */
export function startDraft(game: ElevatorRaceGame, roster: string[]): ElevatorRaceGame {
  game.players = Object.fromEntries(roster.map(name => [name, blankPlayer()]))
  game.phase = 'draft'
  game.draft = {
    cycle: 1,
    deadline: new Date(Date.now() + PHASE_MS).toISOString(),
    bids: Object.fromEntries(roster.map(p => [p, null])),
    notes: [],
  }
  log(game, 'setup', `Торги за силы: цикл 1 из ${DRAFT_CYCLES}.`)
  return game
}

export function start(game: ElevatorRaceGame, roster: string[]): ElevatorRaceGame {
  for (const name of roster) {
    // somebody added to the season after the draft still gets a seat
    if (!game.players[name]) game.players[name] = blankPlayer()
    const player = game.players[name]
    player.hand = openingHand(player)
    player.lotto = facesFor(player, 'lotto')
    player.lives = startingLives(player)
    if (has(player, 'reserve')) player.reserve = [...ROLLERS]
  }
  openTurn(game, 'roll')
  log(game, 'setup', `Гонка началась. Участников: ${roster.length}.`)
  return game
}

export function submitRoll(
  game: ElevatorRaceGame, name: string, roller: RollerKind, charge: Charge, forced?: RollValue,
): RollValue {
  const turn = currentTurn(game)!
  const player = game.players[name]
  const value = forced ?? rollFor(player, roller)
  turn.entries[name] = { ...turn.entries[name], roller, value }
  useRoller(game, name, roller, charge)
  return value
}

export function submitClaim(game: ElevatorRaceGame, name: string, claim: RollValue): ElevatorRaceGame {
  const turn = currentTurn(game)!
  const entry = turn.entries[name]
  turn.entries[name] = { ...entry, claim }
  const player = game.players[name]
  player.claimsThisReset += 1
  if (entry.value != null && claim !== entry.value) player.lies += 1
  return game
}

export function submitChallenge(game: ElevatorRaceGame, name: string, target: string): ElevatorRaceGame {
  const turn = currentTurn(game)!
  turn.entries[name] = { ...turn.entries[name], challenge: target }
  return game
}

// ---------- resolving ----------

/** The elevator a square carries, if any, pointing the way it currently runs. */
export function elevatorAt(game: ElevatorRaceGame, space: number): Elevator | null {
  if (!game.flipped) return game.elevators.find(e => e.from === space) ?? null
  // once somebody has finished every arrow turns around, so an elevator now
  // runs from where it used to land back to where it used to start
  const found = game.elevators.find(e => e.to === space)
  return found ? { from: found.to, to: found.from } : null
}

function crossedPurple(from: number, to: number): boolean {
  return PURPLE.some(border => from < border && border <= to)
}

const isSquare = (n: number): boolean => n > 0 && Number.isInteger(Math.sqrt(n))

/**
 * The elevator as this player sees it. Climber ignores them, Reverse turns
 * them around, and Dash makes every one of them run the same way.
 */
function elevatorForPlayer(game: ElevatorRaceGame, player: ErPlayer, space: number): Elevator | null {
  if (has(player, 'climber')) return null

  const plain = game.elevators.find(e => e.from === space || e.to === space)
  if (!plain) return null

  if (has(player, 'dash')) {
    // downward for everyone until somebody is home, upward after that
    const low = Math.min(plain.from, plain.to)
    const high = Math.max(plain.from, plain.to)
    const target = game.finishOrder.length === 0 ? low : high
    return target === space ? null : { from: space, to: target }
  }

  const flipped = has(player, 'reverse') ? !game.flipped : game.flipped
  if (!flipped) return plain.from === space ? plain : null
  return plain.to === space ? { from: space, to: plain.from } : null
}

function moveOne(game: ElevatorRaceGame, name: string, steps: number): { to: number; reason: string } {
  const player = game.players[name]
  const from = player.space
  let to = from + steps
  let reason = `${steps} вперёд`

  if (to >= FINISH) {
    player.space = FINISH
    return { to: FINISH, reason: 'финиш' }
  }
  if (to < 0) to = 0

  const elevator = elevatorForPlayer(game, player, to)
  if (elevator) {
    reason += `, лифт ${to} на ${elevator.to}`
    to = elevator.to
  }
  if (to < lowestSpaceOn(game.floor)) to = lowestSpaceOn(game.floor)

  // Shove pushes anyone who would land on its owner one square back
  const blocker = players(game).find(other =>
    other !== name && has(game.players[other], 'shove') &&
    game.players[other].space === to && game.players[other].finishPlace == null)
  if (blocker) {
    to = Math.max(0, to - 1)
    reason += `, ${blocker} отбрасывает на клетку назад`
  }

  if (crossedPurple(from, to) && player.lives < MAX_LIVES) {
    player.lives += 1
    reason += ', пересёк фиолетовую границу и получает жизнь'
  }
  if (has(player, 'powered') && isSquare(to) && player.lives < MAX_LIVES) {
    player.lives += 1
    reason += ', квадратное число и ещё жизнь'
  }
  player.space = to
  return { to, reason }
}

function finishPlayer(game: ElevatorRaceGame, name: string): void {
  const player = game.players[name]
  player.finishPlace = game.finishOrder.length + 1
  game.finishOrder = [...game.finishOrder, name]
  if (game.finishOrder.length === 1) {
    game.flipped = true
    log(game, 'board', `${name} финишировал первым. Все лифты развернулись.`)
  } else {
    log(game, 'move', `${name} финишировал ${player.finishPlace}-м.`)
  }
}

/** The bottom row falls away every five turns. */
function cutBottomRow(game: ElevatorRaceGame, charge: Charge): void {
  const doomed = game.floor
  game.floor += 1
  const bottom = lowestSpaceOn(game.floor)

  for (const name of racing(game)) {
    const player = game.players[name]
    if (rowOf(player.space) > doomed || player.space === 0) continue
    const room = Math.max(0, CUT_PENALTY_CAP - player.cutPenaltyPaid)
    const fine = Math.min(CUT_PENALTY, room)
    if (fine > 0) {
      charge(name, fine)
      player.cutPenaltyPaid += fine
    }
    player.space = bottom
    log(game, 'board', `${name} остался на срезанном ряду: штраф ${fine} и переезд на ${bottom}.`)
  }

  // single row elevators die with the row, double row ones lose a row
  game.elevators = game.elevators.flatMap(e => {
    if (rowOf(e.from) <= doomed || rowOf(e.to) <= doomed) {
      const span = elevatorSpan(e)
      if (span < 2) return []
      const shrunk = e.to > e.from ? { from: e.from, to: e.to - COLUMNS } : { from: e.from, to: e.to + COLUMNS }
      return rowOf(shrunk.to) <= doomed ? [] : [shrunk]
    }
    return [e]
  })
  log(game, 'board', `Нижний ряд ${doomed} срезан. Лифты пересчитаны.`)
}

/**
 * Closes the bluff phase: challenges land, everybody else moves, and every
 * fifth turn takes the bottom row with it.
 */
export function resolveTurn(game: ElevatorRaceGame, charge: Charge): ElevatorRaceGame {
  const turn = currentTurn(game)
  if (!turn || turn.closedAt) return game

  const anyoneFinished = game.finishOrder.length > 0
  const liars = new Set(racing(game).filter(p => {
    const entry = turn.entries[p]
    return entry.claim != null && entry.value != null && entry.claim !== entry.value
  }))

  // a challenge burns the liar, or the challenger if the claim was honest
  const punished = new Set<string>()
  for (const [challenger, entry] of Object.entries(turn.entries)) {
    const target = entry.challenge
    if (!target) continue
    if (liars.has(target)) {
      punished.add(target)
      log(game, 'bluff', `${challenger} поймал ${target} на лжи.`)
      const hunter = game.players[challenger]
      if (has(hunter, 'detective') && hunter.lives < MAX_LIVES) hunter.lives += 1
      // Bandit pays extra for being caught
      if (has(game.players[target], 'bandit')) charge(target, 1)
    } else {
      punished.add(challenger)
      log(game, 'bluff', `${challenger} обвинил ${target} напрасно.`)
    }
  }

  const moved: Record<string, { from: number; to: number; reason: string }> = {}

  for (const name of racing(game)) {
    const player = game.players[name]
    const from = player.space
    const entry = turn.entries[name]

    if (punished.has(name)) {
      if (player.lives > 0) {
        player.lives -= 1
        moved[name] = { from, to: from, reason: 'штраф: минус жизнь, хода нет' }
      } else {
        const shift = anyoneFinished ? -2 : 2
        const to = Math.max(0, Math.min(FINISH - 1, rowsUp(from, shift)))
        player.space = to
        moved[name] = { from, to, reason: `штраф без жизней: ${shift > 0 ? 'вверх' : 'вниз'} на 2 ряда` }
      }
      continue
    }

    if (entry.value === 'bust') {
      charge(name, BUST_PENALTY)
      moved[name] = { from, to: from, reason: `bust: хода нет, минус ${BUST_PENALTY} псигем` }
      continue
    }
    if (entry.value == null) {
      moved[name] = { from, to: from, reason: 'без броска' }
      continue
    }

    const result = moveOne(game, name, entry.value)
    moved[name] = { from, to: result.to, reason: result.reason }
    if (result.to >= FINISH) finishPlayer(game, name)
  }

  turn.moved = moved
  turn.closedAt = new Date().toISOString()
  log(game, 'move', `Ход ${turn.number} разыгран.`)

  if (turn.number % CUT_EVERY === 0) cutBottomRow(game, charge)

  // the race is over once a single player is left on the board
  if (racing(game).length <= 1) {
    for (const name of racing(game)) finishPlayer(game, name)
    game.phase = 'finished'
    log(game, 'end', `Гонка закончена. Порядок финиша: ${game.finishOrder.join(', ')}.`)
    return game
  }

  openTurn(game, 'roll')
  return game
}

/** Ends the roll phase: anyone who did not roll gets a random roller. */
export function closeRollPhase(game: ElevatorRaceGame, charge: Charge): ElevatorRaceGame {
  const turn = currentTurn(game)
  if (!turn || turn.phase !== 'roll') return game

  for (const name of racing(game)) {
    const entry = turn.entries[name]
    if (!entry.roller) {
      const roller = pick(game.players[name].hand)
      const value = submitRoll(game, name, roller, charge)
      log(game, 'roll', `${name} не бросил сам, за него брошен ${roller}.`)
      turn.entries[name] = { ...turn.entries[name], roller, value }
    }
    // silence in the claim is taken as the honest number
    if (turn.entries[name].claim == null) {
      submitClaim(game, name, turn.entries[name].value!)
    }
  }
  openTurn(game, 'bluff')
  log(game, 'bluff', `Заявки хода ${turn.number} опубликованы.`)
  return game
}

export function placeBid(game: ElevatorRaceGame, name: string, power: string, amount: number): ElevatorRaceGame {
  if (!game.draft) return game
  game.draft.bids = { ...game.draft.bids, [name]: { power, amount } }
  return game
}

/**
 * Closes one draft cycle: the powers are handed out, the winning bids are
 * spent, and either the next cycle or the configuration window opens.
 */
export function closeDraftCycle(
  game: ElevatorRaceGame,
  totals: Record<string, number>,
  charge: Charge,
): ElevatorRaceGame {
  const draft = game.draft
  if (!draft) return game

  // the last window is for choosing faces, not for bidding
  if (draft.cycle > POWER_COLUMNS.length) {
    game.draft = null
    return start(game, players(game))
  }

  const column = POWER_COLUMNS[draft.cycle - 1]
  const taken = new Set(players(game).flatMap(p => game.players[p].powers))
  const result = resolveCycle(column, draft.bids, players(game), totals, taken)

  for (const [player, power] of Object.entries(result.awarded)) {
    game.players[player].powers = [...game.players[player].powers, power]
    const cost = result.paid[player] ?? 0
    if (cost > 0) charge(player, cost)
    log(game, 'setup', `${player} получает ${powerById(power)?.name ?? power}${cost > 0 ? ` за ${cost} псигемов` : ''}.`)
  }
  for (const note of result.notes) draft.notes = [...draft.notes, note]

  const nextCycle = draft.cycle + 1
  game.draft = {
    cycle: nextCycle,
    deadline: new Date(Date.now() + PHASE_MS).toISOString(),
    bids: Object.fromEntries(players(game).map(p => [p, null])),
    notes: draft.notes,
  }
  log(game, 'setup', nextCycle > POWER_COLUMNS.length
    ? 'Все силы разобраны. Сутки на выбор настроек, потом старт.'
    : `Торги за силы: цикл ${nextCycle} из ${DRAFT_CYCLES}.`)
  return game
}

export function applyClock(
  game: ElevatorRaceGame,
  charge: Charge,
  now = Date.now(),
  totals: Record<string, number> = {},
): ElevatorRaceGame {
  if (game.phase === 'draft' && game.draft) {
    return now < new Date(game.draft.deadline).getTime()
      ? game
      : closeDraftCycle(game, totals, charge)
  }
  const turn = currentTurn(game)
  if (!turn || game.phase === 'setup' || game.phase === 'finished') return game
  if (now < new Date(turn.deadline).getTime()) return game
  return turn.phase === 'roll' ? closeRollPhase(game, charge) : resolveTurn(game, charge)
}

export function buyLife(game: ElevatorRaceGame, name: string): ElevatorRaceGame {
  const player = game.players[name]
  player.lives = Math.min(MAX_LIVES, player.lives + 1)
  log(game, 'move', `${name} купил жизнь за ${LIFE_COST} псигемов.`)
  return game
}

// ---------- payouts ----------

export interface ErPayout {
  psigems: Record<string, number>
  clearOpals: Record<string, number>
  deathmatch: string[]
}

export function payoutFor(game: ElevatorRaceGame): ErPayout {
  const psigems: Record<string, number> = {}
  const clearOpals: Record<string, number> = {}
  const deathmatch: string[] = []
  const total = game.finishOrder.length

  game.finishOrder.forEach((name, index) => {
    // the table is written for ten runners, so the last place always pays last
    const prize = index === total - 1 ? PRIZES[PRIZES.length - 1] : PRIZES[Math.min(index, PRIZES.length - 2)]
    if (prize.psigems > 0) psigems[name] = prize.psigems
    if (prize.clearOpal) clearOpals[name] = 1
    if (prize.deathmatch) deathmatch.push(name)
  })
  return { psigems, clearOpals, deathmatch }
}

// ---------- what a viewer sees ----------

export interface ErView {
  id: string
  name: string
  phase: ErPhase
  floor: number
  flipped: boolean
  elevators: Elevator[]
  turnNumber: number
  deadline: string | null
  /** everybody's square, lives and roller count is public */
  standings: {
    player: string
    space: number
    lives: number
    handSize: number
    finishPlace: number | null
    claim: RollValue | null
    challengedBy: string[]
  }[]
  myHand: RollerKind[]
  myRoll: { roller: RollerKind; value: RollValue } | null
  myClaim: RollValue | null
  myChallenge: string | null
  myLies: number
  myPowers: string[]
  myConfig: ErConfig
  /** everybody's powers are public once the draft has handed them out */
  powersOf: Record<string, string[]>
  draft: { cycle: number; deadline: string; bid: { power: string; amount: number } | null; notes: string[] } | null
  lastMoves: Record<string, { from: number; to: number; reason: string }> | null
  finishOrder: string[]
  payout: ErPayout | null
  log: ErLogEntry[]
  inRace: boolean
}

export function viewFor(game: ElevatorRaceGame, username: string): ErView {
  const turn = currentTurn(game)
  const mine = turn?.entries[username] ?? null
  const bluffing = game.phase === 'bluff'

  const challengedBy = (target: string): string[] =>
    Object.entries(turn?.entries ?? {})
      .filter(([, e]) => e.challenge === target)
      .map(([who]) => who)

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    floor: game.floor,
    flipped: game.flipped,
    elevators: game.elevators,
    turnNumber: turn?.number ?? 0,
    deadline: turn?.deadline ?? null,
    standings: players(game).map(player => ({
      player,
      space: game.players[player].space,
      lives: game.players[player].lives,
      handSize: game.players[player].hand.length,
      finishPlace: game.players[player].finishPlace,
      // claims only become public once the bluff phase opens
      claim: bluffing ? (turn?.entries[player]?.claim ?? null) : null,
      challengedBy: bluffing ? challengedBy(player) : [],
    })),
    myHand: game.players[username]?.hand ?? [],
    myRoll: mine?.roller && mine.value != null ? { roller: mine.roller, value: mine.value } : null,
    myClaim: mine?.claim ?? null,
    myChallenge: mine?.challenge ?? null,
    myLies: game.players[username]?.lies ?? 0,
    myPowers: game.players[username]?.powers ?? [],
    myConfig: game.players[username]?.config ?? {},
    powersOf: Object.fromEntries(players(game).map(p => [p, game.players[p].powers ?? []])),
    draft: game.draft ? {
      cycle: game.draft.cycle,
      deadline: game.draft.deadline,
      // a sealed bid stays sealed: you only ever see your own
      bid: game.draft.bids[username] ?? null,
      notes: game.draft.notes,
    } : null,
    lastMoves: game.turns.filter(t => t.closedAt).slice(-1)[0]?.moved ?? null,
    finishOrder: game.finishOrder,
    payout: game.phase === 'finished' ? payoutFor(game) : null,
    log: game.log,
    inRace: !!game.players[username],
  }
}
