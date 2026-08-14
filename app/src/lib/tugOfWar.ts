import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  MODULES, MODULE_NAMES, MODULES_TO_WIN, START_HAND_FIRST, START_HAND_SECOND,
  MAX_HAND, MAX_CARDS_PER_TURN, MAX_CARDS_ON_PATH, TURN_MS, RESERVE_MS,
  ROPE_TRACK, ROPE_LETTERS, ROPE_POINTS_TO_WIN,
  RACE_TRACK, RACE_POINTS_TO_WIN, raceMove,
  COLLATION_PILE, COLLATION_POINTS_TO_WIN, COLLATION_EARLY_TAKEN, COLLATION_EARLY_HELD,
  COLLATION_CARDS_PER_COUNTERS,
  CLOCK_SEGMENTS, CLOCK_POINTS_TO_WIN,
  PATH_SIZE, PATH_POINTS_TO_WIN,
  CONKER_POINTS_TO_WIN,
  TOWER_MAX, TOWER_LIGHT_LEAD, towerLights,
  cascade, allowedModules,
  type ModuleId,
} from './tugOfWarData'

// Tug of War: seven little games at once, all fed by the same hand of push
// cards, and the cards you get back depend on what the module looks like after
// your turn.

const PATH = join(process.cwd(), 'tugofwar.json')

export type Side = 'red' | 'blue'
export type TwPhase = 'setup' | 'live' | 'finished'
export type Tile = 'red' | 'blue' | 'grey'

export interface TwModules {
  /** how far each player stands from the pit */
  rope: { spots: Record<Side, number>; points: Record<Side, number> }
  race: { at: Record<Side, number>; points: Record<Side, number> }
  collation: { pile: number; held: Record<Side, number>; points: Record<Side, number> }
  /** positive segments belong to red, negative to blue */
  clock: { filled: number; owner: Side | null; points: Record<Side, number> }
  path: { tiles: Tile[]; points: Record<Side, number> }
  conker: { height: Record<Side, number>; points: Record<Side, number> }
  tower: { height: Record<Side, number> }
}

export interface TwLogEntry {
  at: string
  text: string
  kind: 'setup' | 'turn' | 'module' | 'card' | 'end'
}

export interface TugOfWarGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  sides: Record<string, Side>
  phase: TwPhase
  hands: Record<string, number[]>
  modules: TwModules
  won: Record<ModuleId, string | null>
  lastModule: Record<string, ModuleId | null>
  /** the three star item can shut one module for the opponent's next turn */
  blocked: Record<string, ModuleId | null>
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  winner: string | null
  log: TwLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, TugOfWarGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, TugOfWarGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): TugOfWarGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: TugOfWarGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

/** The Path board starts as a chequerboard, which is what the art shows. */
export function freshPath(): Tile[] {
  return Array.from({ length: PATH_SIZE * PATH_SIZE }, (_, i) => {
    const row = Math.floor(i / PATH_SIZE)
    const col = i % PATH_SIZE
    return (row + col) % 2 === 0 ? 'red' : 'blue'
  })
}

export function freshModules(): TwModules {
  return {
    rope: { spots: { red: 9, blue: 9 }, points: { red: 0, blue: 0 } },
    race: { at: { red: 0, blue: 0 }, points: { red: 0, blue: 0 } },
    collation: { pile: COLLATION_PILE, held: { red: 0, blue: 0 }, points: { red: 0, blue: 0 } },
    clock: { filled: 0, owner: null, points: { red: 0, blue: 0 } },
    path: { tiles: freshPath(), points: { red: 0, blue: 0 } },
    conker: { height: { red: 0, blue: 0 }, points: { red: 0, blue: 0 } },
    tower: { height: { red: 0, blue: 0 } },
  }
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): TugOfWarGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: TugOfWarGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null, sides: {},
    phase: 'setup',
    hands: {},
    modules: freshModules(),
    won: Object.fromEntries(MODULES.map(id => [id, null])) as Record<ModuleId, string | null>,
    lastModule: {}, blocked: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    winner: null, log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: TugOfWarGame): TugOfWarGame {
  return {
    ...game,
    phase: 'setup', sides: {}, hands: {}, modules: freshModules(),
    won: Object.fromEntries(MODULES.map(id => [id, null])) as Record<ModuleId, string | null>,
    lastModule: {}, blocked: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    winner: null, log: [],
  }
}

function log(game: TugOfWarGame, kind: TwLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: TugOfWarGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: TugOfWarGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function sideOf(game: TugOfWarGame, player: string): Side {
  return game.sides[player] ?? 'red'
}

export function activeModules(game: TugOfWarGame): ModuleId[] {
  return MODULES.filter(id => !game.won[id])
}

export function modulesWonBy(game: TugOfWarGame, player: string): number {
  return MODULES.filter(id => game.won[id] === player).length
}

/** Every point this player holds on modules still in play. */
export function livePoints(game: TugOfWarGame, player: string): number {
  const side = sideOf(game, player)
  let total = 0
  for (const id of activeModules(game)) {
    const module = game.modules[id as keyof TwModules] as { points?: Record<Side, number> }
    total += module.points?.[side] ?? 0
  }
  return total
}

// ---------- handing cards out ----------

function give(game: TugOfWarGame, player: string, strength: number): void {
  const cards = cascade(strength)
  if (cards.length === 0) return
  game.hands = { ...game.hands, [player]: [...(game.hands[player] ?? []), ...cards] }
  log(game, 'card', `${player} получает ${cards.join(', ')}`)
}

/** A hand over the limit is trimmed from the weakest card up. */
export function trimHand(hand: number[]): number[] {
  if (hand.length <= MAX_HAND) return hand
  return [...hand].sort((a, b) => b - a).slice(0, MAX_HAND)
}

function spend(game: TugOfWarGame, player: string, cards: number[]): boolean {
  const hand = [...(game.hands[player] ?? [])]
  for (const card of cards) {
    const index = hand.indexOf(card)
    if (index < 0) return false
    hand.splice(index, 1)
  }
  game.hands = { ...game.hands, [player]: hand }
  return true
}

// ---------- the modules ----------

function winModule(game: TugOfWarGame, id: ModuleId, player: string): void {
  game.won[id] = player
  log(game, 'module', `${player} забирает модуль ${MODULE_NAMES[id]}`)
}

/** Whenever anybody scores anywhere, the conkers drop and are compared. */
function releaseConkers(game: TugOfWarGame): void {
  if (game.won.conker) return
  const conker = game.modules.conker
  const [a, b] = duelists(game)
  const sideA = sideOf(game, a)
  const sideB = sideOf(game, b)
  if (conker.height[sideA] !== conker.height[sideB]) {
    const taller = conker.height[sideA] > conker.height[sideB] ? a : b
    conker.points[sideOf(game, taller)] += 1
    give(game, taller, 1)
    log(game, 'module', `Каштаны сброшены: очко берёт ${taller}`)
    if (conker.points[sideOf(game, taller)] >= CONKER_POINTS_TO_WIN) winModule(game, 'conker', taller)
  } else {
    log(game, 'module', 'Каштаны сброшены вровень, очко не ушло никому')
  }
  conker.height[sideA] = 0
  conker.height[sideB] = 0
}

interface TurnResult {
  reward: number
  extraCards: number[]
  opponentCards: number[]
  scored: boolean
}

/** The rope reward letters, spelled out where the board is read. */
export function ropeReward(
  game: TugOfWarGame, player: string, spot: number, cardsPlayed: number,
): number {
  const letter = ROPE_LETTERS[spot] ?? 'A'
  const rival = other(game, player)
  switch (letter) {
    case 'A': return Math.abs((game.hands[player] ?? []).length - (game.hands[rival] ?? []).length) + 1
    case 'B': return 4
    case 'C': return 1
    case 'D': return modulesWonBy(game, player) + 1
    case 'E': return cardsPlayed
    case 'F': return livePoints(game, player) + 1
    default: return 5
  }
}

function playRope(game: TugOfWarGame, player: string, strength: number, cardsPlayed: number): TurnResult {
  const rope = game.modules.rope
  const me = sideOf(game, player)
  const rival = other(game, player)
  const them = sideOf(game, rival)

  rope.spots[me] = Math.min(ROPE_TRACK, rope.spots[me] + strength)
  rope.spots[them] = Math.max(0, rope.spots[them] - strength)

  const result: TurnResult = { reward: 0, extraCards: [], opponentCards: [], scored: false }
  if (rope.spots[them] === 0) {
    rope.points[me] += 1
    result.scored = true
    log(game, 'module', `${player} стянул соперника в яму`)
    rope.spots[me] = 9
    rope.spots[them] = 9
    if (rope.points[me] >= ROPE_POINTS_TO_WIN) winModule(game, 'rope', player)
  }

  const letter = ROPE_LETTERS[rope.spots[me]] ?? 'A'
  result.reward = ropeReward(game, player, rope.spots[me], cardsPlayed)
  if (letter === 'B') result.opponentCards = [1]
  if (letter === 'C') { result.extraCards = [1, 1]; result.opponentCards = [2] }
  return result
}

function playRace(game: TugOfWarGame, player: string, strength: number): TurnResult {
  const race = game.modules.race
  const me = sideOf(game, player)
  const rival = other(game, player)
  const them = sideOf(game, rival)

  race.at[me] = raceMove(race.at[me], strength)
  const result: TurnResult = { reward: 0, extraCards: [], opponentCards: [], scored: false }

  if (race.at[me] >= RACE_TRACK) {
    race.points[me] += 1
    result.scored = true
    result.reward = 1
    race.at[me] = 0
    race.at[them] = 0
    log(game, 'module', `${player} добежал до конца`)
    if (race.points[me] >= RACE_POINTS_TO_WIN) winModule(game, 'race', player)
    return result
  }
  result.reward = Math.abs(race.at[me] - race.at[them])
  return result
}

function playCollation(game: TugOfWarGame, player: string, strength: number): TurnResult {
  const pile = game.modules.collation
  const me = sideOf(game, player)
  const rival = other(game, player)
  const them = sideOf(game, rival)

  const taken = Math.min(strength, pile.pile)
  pile.pile -= taken
  pile.held[me] += taken
  const result: TurnResult = { reward: taken, extraCards: [], opponentCards: [], scored: false }

  const emptied = pile.pile === 0
  const gone = COLLATION_PILE - pile.pile
  const early = gone >= COLLATION_EARLY_TAKEN &&
    (pile.held[me] >= COLLATION_EARLY_HELD || pile.held[them] >= COLLATION_EARLY_HELD)

  if (emptied || early) {
    const winner = pile.held[me] > pile.held[them] ? player : pile.held[them] > pile.held[me] ? rival : null
    if (winner) {
      pile.points[sideOf(game, winner)] += 1
      result.scored = true
      log(game, 'module', `${winner} собрал больше фишек`)
    }
    // the reset pays everybody a card for every five counters they held
    for (const person of duelists(game)) {
      const held = pile.held[sideOf(game, person)]
      for (let i = 0; i < Math.floor(held / COLLATION_CARDS_PER_COUNTERS); i++) {
        if (person === player) result.extraCards.push(1)
        else result.opponentCards.push(1)
      }
    }
    result.reward = 0
    pile.pile = COLLATION_PILE
    pile.held[me] = 0
    pile.held[them] = 0
    if (winner && pile.points[sideOf(game, winner)] >= COLLATION_POINTS_TO_WIN) {
      winModule(game, 'collation', winner)
    }
  }
  return result
}

/**
 * The clock is one strip of eight. Filling it with your own colour adds, and
 * pushing against the other colour takes their segments back off.
 */
function playClock(game: TugOfWarGame, player: string, strength: number): TurnResult {
  const clock = game.modules.clock
  const me = sideOf(game, player)
  const result: TurnResult = { reward: 0, extraCards: [], opponentCards: [], scored: false }

  if (clock.owner === null || clock.owner === me) {
    clock.owner = me
    clock.filled += strength
  } else {
    clock.filled -= strength
    if (clock.filled < 0) {
      clock.owner = me
      clock.filled = -clock.filled
    } else if (clock.filled === 0) {
      clock.owner = null
    }
  }

  if (clock.filled >= CLOCK_SEGMENTS && clock.owner === me) {
    const excess = clock.filled - CLOCK_SEGMENTS
    clock.points[me] += 1
    result.scored = true
    result.reward = 2 + excess
    clock.filled = 0
    clock.owner = null
    log(game, 'module', `${player} закрасил часы целиком`)
    if (clock.points[me] >= CLOCK_POINTS_TO_WIN) winModule(game, 'clock', player)
    return result
  }
  // a quarter of the clock is two segments
  result.reward = Math.floor(clock.filled / 2) + 1
  return result
}

/** The longest run of your colour, taken along rows and columns alike. */
export function longestLine(tiles: Tile[], side: Side): number {
  let best = 0
  for (let row = 0; row < PATH_SIZE; row++) {
    let run = 0
    for (let col = 0; col < PATH_SIZE; col++) {
      run = tiles[row * PATH_SIZE + col] === side ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  for (let col = 0; col < PATH_SIZE; col++) {
    let run = 0
    for (let row = 0; row < PATH_SIZE; row++) {
      run = tiles[row * PATH_SIZE + col] === side ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  return best
}

/** Whether one colour joins top to bottom or left to right. */
export function pathConnected(tiles: Tile[], side: Side): boolean {
  const seen = new Set<number>()
  const walk = (start: number[], reached: (index: number) => boolean): boolean => {
    const queue = start.filter(index => tiles[index] === side)
    for (const index of queue) seen.add(index)
    while (queue.length > 0) {
      const index = queue.shift()!
      if (reached(index)) return true
      const row = Math.floor(index / PATH_SIZE)
      const col = index % PATH_SIZE
      const near = [
        col > 0 ? index - 1 : -1,
        col < PATH_SIZE - 1 ? index + 1 : -1,
        row > 0 ? index - PATH_SIZE : -1,
        row < PATH_SIZE - 1 ? index + PATH_SIZE : -1,
      ]
      for (const next of near) {
        if (next < 0 || seen.has(next) || tiles[next] !== side) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return false
  }

  const topRow = Array.from({ length: PATH_SIZE }, (_, col) => col)
  if (walk(topRow, index => Math.floor(index / PATH_SIZE) === PATH_SIZE - 1)) return true
  seen.clear()
  const leftColumn = Array.from({ length: PATH_SIZE }, (_, row) => row * PATH_SIZE)
  return walk(leftColumn, index => index % PATH_SIZE === PATH_SIZE - 1)
}

function playPath(game: TugOfWarGame, player: string, tilesTouched: number[]): TurnResult {
  const path = game.modules.path
  const me = sideOf(game, player)
  const result: TurnResult = { reward: 0, extraCards: [], opponentCards: [], scored: false }

  for (const index of tilesTouched) {
    const tile = path.tiles[index]
    if (tile === 'grey') path.tiles[index] = me
    else path.tiles[index] = tile === 'red' ? 'blue' : 'red'
  }

  if (pathConnected(path.tiles, me)) {
    path.points[me] += 1
    result.scored = true
    // a board with no grey left pays five, otherwise one
    result.reward = path.tiles.some(tile => tile === 'grey') ? 1 : 5
    path.tiles = freshPath()
    log(game, 'module', `${player} проложил путь`)
    if (path.points[me] >= PATH_POINTS_TO_WIN) winModule(game, 'path', player)
    return result
  }
  result.reward = longestLine(path.tiles, me)
  return result
}

function playConker(game: TugOfWarGame, player: string, strength: number, cardsPlayed: number): TurnResult {
  const conker = game.modules.conker
  conker.height[sideOf(game, player)] += strength
  return {
    reward: 1,
    extraCards: cardsPlayed > 1 ? [1] : [],
    opponentCards: [],
    scored: false,
  }
}

function playTower(game: TugOfWarGame, player: string, strength: number, option: string): TurnResult {
  const tower = game.modules.tower
  const me = sideOf(game, player)
  const rival = other(game, player)
  const them = sideOf(game, rival)

  tower.height[me] = Math.min(TOWER_MAX, tower.height[me] + strength)
  const result: TurnResult = { reward: 0, extraCards: [], opponentCards: [], scored: false }

  const mine = towerLights(tower.height[me])
  const theirs = towerLights(tower.height[them])
  if (tower.height[me] >= TOWER_MAX || mine - theirs >= TOWER_LIGHT_LEAD) {
    winModule(game, 'tower', player)
    result.scored = true
  }

  if (option === 'B') { result.reward = 4; result.opponentCards = [1] }
  else if (option === 'C') { result.reward = 1; result.extraCards = [1, 1]; result.opponentCards = [2] }
  else result.reward = Math.abs(mine - theirs) + 1
  return result
}

// ---------- the turn ----------

export function legalModules(game: TugOfWarGame, player: string): ModuleId[] {
  const rival = other(game, player)
  const list = allowedModules(activeModules(game), game.lastModule[player] ?? null, game.lastModule[rival] ?? null)
  const blocked = game.blocked[player]
  return blocked ? list.filter(id => id !== blocked) : list
}

function finish(game: TugOfWarGame, winner: string, reason: string): TugOfWarGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

function chargeReserve(game: TugOfWarGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: TugOfWarGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

export function applyClock(game: TugOfWarGame, now = Date.now()): TugOfWarGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

export function startGame(game: TugOfWarGame, first: string): TugOfWarGame {
  const second = other(game, first)
  game.sides = { [first]: 'red', [second]: 'blue' }
  game.hands = { [first]: [...START_HAND_FIRST], [second]: [...START_HAND_SECOND] }
  game.modules = freshModules()
  game.phase = 'live'
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  game.lastModule = {}
  game.blocked = {}
  log(game, 'setup', `Игра началась, первым ходит ${first}.`)
  return game
}

export interface TurnInput {
  module: ModuleId
  cards: number[]
  /** the tower asks which reward you want, and the path which tiles you touch */
  option?: string
  tiles?: number[]
  /** the three star item shuts a module for the opponent's next turn */
  block?: ModuleId
}

export function takeTurn(game: TugOfWarGame, player: string, input: TurnInput): TugOfWarGame {
  chargeReserve(game, Date.now())
  const rival = other(game, player)
  const strength = input.cards.reduce((total, card) => total + card, 0)
  if (!spend(game, player, input.cards)) return game

  let result: TurnResult
  switch (input.module) {
    case 'rope': result = playRope(game, player, strength, input.cards.length); break
    case 'race': result = playRace(game, player, strength); break
    case 'collation': result = playCollation(game, player, strength); break
    case 'clock': result = playClock(game, player, strength); break
    case 'path': result = playPath(game, player, input.tiles ?? []); break
    case 'conker': result = playConker(game, player, strength, input.cards.length); break
    default: result = playTower(game, player, strength, input.option ?? 'A'); break
  }

  log(game, 'turn', `${player} играет ${input.cards.join(', ')} на модуле ${MODULE_NAMES[input.module]}`)
  give(game, player, result.reward)
  for (const card of result.extraCards) give(game, player, card)
  for (const card of result.opponentCards) give(game, rival, card)

  // a point anywhere drops the conkers, unless the point was the conkers
  if (result.scored && input.module !== 'conker') releaseConkers(game)

  game.hands = {
    ...game.hands,
    [player]: trimHand(game.hands[player] ?? []),
    [rival]: trimHand(game.hands[rival] ?? []),
  }
  game.lastModule = { ...game.lastModule, [player]: input.module }
  game.blocked = { ...game.blocked, [player]: null, [rival]: input.block ?? null }

  if (modulesWonBy(game, player) >= MODULES_TO_WIN) {
    return finish(game, player, `взято модулей: ${MODULES_TO_WIN}`)
  }
  if ((game.hands[rival] ?? []).length === 0) {
    return finish(game, player, `у ${rival} кончились карты`)
  }
  if ((game.hands[player] ?? []).length === 0) {
    return finish(game, rival, `у ${player} кончились карты`)
  }

  game.turn = rival
  game.turnStartedAt = new Date().toISOString()
  return game
}

// ---------- what a viewer sees ----------

export interface TwView {
  id: string
  name: string
  phase: TwPhase
  ec: string | null
  opponent: string | null
  mySide: Side | null
  myHand: number[]
  handSizes: Record<string, number>
  modules: TwModules
  won: Record<string, string | null>
  legal: ModuleId[]
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  winner: string | null
  isDuelist: boolean
  log: TwLogEntry[]
}

export function viewFor(game: TugOfWarGame, username: string): TwView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    mySide: isDuelist ? sideOf(game, username) : null,
    // a hand is private, but its size is not
    myHand: isDuelist ? (game.hands[username] ?? []) : [],
    handSizes: Object.fromEntries(duelists(game).map(p => [p, (game.hands[p] ?? []).length])),
    modules: game.modules,
    won: game.won,
    legal: isDuelist && game.turn === username ? legalModules(game, username) : [],
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    winner: game.winner,
    isDuelist,
    log: game.log,
  }
}

export { MODULES, MODULE_NAMES, MAX_CARDS_PER_TURN, MAX_CARDS_ON_PATH }
export type { ModuleId }
