import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  BASE_OF, COLOURS, COLOUR_NAMES, LETTERS, OPPOSITE_GATE, START_ACTIVE,
  START_LETTERS, START_TILES, gateById, reachable, shove,
  type Colour, type Orient,
} from './labyrinthBoard'

// Labyrinth: four treasure hunters shove the maze around underneath each other,
// gathering six chests apiece and racing home.

const PATH = join(process.cwd(), 'labyrinth.json')

export const SEATS = 4
export const DECK_SIZE = 6
export const HAND_SIZE = 2
export const MAX_BID = 8
export const TURN_MS = 86_400_000
export const PSIGEMS_PER_CHEST = 2
export const PSIGEMS_FOR_WIN = 5

export type LabPhase = 'setup' | 'bid_start' | 'bid_order' | 'play' | 'pick_ec' | 'finished'
export type LabStep = 'shove' | 'move'

export type Field = 'psigems' | 'opals' | 'tol'
export type Grant = (field: Field, deltas: Record<string, number>) => void

export interface StartBid { bid: number; prefs: Colour[] }
export interface OrderBid { bid: number; target: string }

export interface LabLogEntry {
  at: string
  text: string
  kind: 'setup' | 'bid' | 'shove' | 'move' | 'chest' | 'end'
}

export interface LabyrinthGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  players: string[]
  /** priority for ties, the player who last won a death match sits first */
  tiebreak: string[]
  phase: LabPhase
  startBids: Record<string, StartBid>
  orderBids: Record<string, OrderBid>
  colours: Record<string, Colour>
  order: string[]
  tiles: Orient[]
  letters: (string | null)[]
  pawns: Record<string, number>
  active: Orient
  lastGate: number | null
  turn: string | null
  turnStartedAt: string | null
  step: LabStep
  decks: Record<string, string[]>
  hands: Record<string, string[]>
  collected: Record<string, string[]>
  /** other players' bases each hunter has stood on, for the opal challenge */
  visited: Record<string, Colour[]>
  winner: string | null
  ec: string | null
  paid: boolean
  log: LabLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, LabyrinthGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, LabyrinthGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): LabyrinthGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: LabyrinthGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

function log(game: LabyrinthGame, kind: LabLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): LabyrinthGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: LabyrinthGame = {
    id: slug, seasonSlug, matchId, name,
    players: [], tiebreak: [],
    phase: 'setup',
    startBids: {}, orderBids: {}, colours: {}, order: [],
    tiles: [...START_TILES], letters: [...START_LETTERS], pawns: {},
    active: START_ACTIVE, lastGate: null,
    turn: null, turnStartedAt: null, step: 'shove',
    decks: {}, hands: {}, collected: {}, visited: {},
    winner: null, ec: null, paid: false,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: LabyrinthGame): LabyrinthGame {
  return {
    ...game,
    phase: game.players.length === SEATS ? 'bid_start' : 'setup',
    startBids: {}, orderBids: {}, colours: {}, order: [],
    tiles: [...START_TILES], letters: [...START_LETTERS], pawns: {},
    active: START_ACTIVE, lastGate: null,
    turn: null, turnStartedAt: null, step: 'shove',
    decks: {}, hands: {}, collected: {}, visited: {},
    winner: null, ec: null, paid: false, log: [],
  }
}

// ---------- setting up ----------

export function setPlayers(game: LabyrinthGame, players: string[], tiebreak: string[]): LabyrinthGame {
  game.players = players.slice(0, SEATS)
  game.tiebreak = tiebreak.filter(p => game.players.includes(p))
  for (const p of game.players) {
    if (!game.tiebreak.includes(p)) game.tiebreak = [...game.tiebreak, p]
  }
  if (game.players.length === SEATS && game.phase === 'setup') {
    game.phase = 'bid_start'
    log(game, 'setup', `Игроки: ${game.players.join(', ')}. Аукцион за стартовый угол открыт.`)
  }
  return game
}

const rank = (game: LabyrinthGame, player: string): number => {
  const i = game.tiebreak.indexOf(player)
  return i < 0 ? SEATS : i
}

// ---------- the auctions ----------

export function bidStart(game: LabyrinthGame, player: string, bid: number, prefs: Colour[]): LabyrinthGame {
  const clean = COLOURS.filter(c => prefs.includes(c))
  const ordered = [...prefs.filter(c => COLOURS.includes(c)), ...clean.filter(c => !prefs.includes(c))]
  game.startBids = {
    ...game.startBids,
    [player]: { bid: Math.max(0, Math.min(MAX_BID, Math.floor(bid))), prefs: ordered as Colour[] },
  }
  return game
}

/** Highest bidder picks first; equal bids are split by who last won a death match. */
export function resolveStart(game: LabyrinthGame, grant: Grant): LabyrinthGame {
  const queue = [...game.players].sort((a, b) => {
    const diff = (game.startBids[b]?.bid ?? 0) - (game.startBids[a]?.bid ?? 0)
    return diff !== 0 ? diff : rank(game, a) - rank(game, b)
  })

  const taken: Colour[] = []
  const colours: Record<string, Colour> = {}
  for (const player of queue) {
    const prefs = game.startBids[player]?.prefs ?? COLOURS
    const pick = prefs.find(c => !taken.includes(c)) ?? COLOURS.find(c => !taken.includes(c)) as Colour
    taken.push(pick)
    colours[player] = pick
  }
  game.colours = colours

  const cost: Record<string, number> = {}
  for (const player of game.players) cost[player] = 0 - (game.startBids[player]?.bid ?? 0)
  grant('psigems', cost)

  for (const player of queue) {
    log(game, 'bid', `${player} ставит ${game.startBids[player]?.bid ?? 0} и берёт ${COLOUR_NAMES[colours[player]]}`)
  }
  game.phase = 'bid_order'
  return game
}

export function bidOrder(game: LabyrinthGame, player: string, bid: number, target: string): LabyrinthGame {
  if (!game.players.includes(target)) return game
  game.orderBids = {
    ...game.orderBids,
    [player]: { bid: Math.max(0, Math.min(MAX_BID, Math.floor(bid))), target },
  }
  return game
}

/** Bids name whoever should start, and everything staked on one player is added up. */
export function resolveOrder(game: LabyrinthGame, grant: Grant): LabyrinthGame {
  const totals: Record<string, number> = Object.fromEntries(game.players.map(p => [p, 0]))
  for (const { bid, target } of Object.values(game.orderBids)) {
    totals[target] = (totals[target] ?? 0) + bid
  }
  const first = [...game.players].sort((a, b) => {
    const diff = totals[b] - totals[a]
    return diff !== 0 ? diff : rank(game, a) - rank(game, b)
  })[0]

  const cost: Record<string, number> = {}
  for (const [player, { bid, target }] of Object.entries(game.orderBids)) {
    if (target === first) cost[player] = 0 - bid
  }
  grant('psigems', cost)

  // seats run clockwise, so play follows the colours round from whoever starts
  const seat = COLOURS.indexOf(game.colours[first])
  game.order = COLOURS.map((_, i) => COLOURS[(seat + i) % SEATS])
    .map(colour => game.players.find(p => game.colours[p] === colour) as string)

  log(game, 'bid', `Первым ходит ${first} (ставок на него: ${totals[first]}). Порядок: ${game.order.join(' → ')}`)
  return deal(game)
}

/**
 * Test helper: bids nothing for anyone still missing, then settles the auction.
 * Zero bids keep the psigem balances untouched while a match is being tried out.
 */
export function autoBids(game: LabyrinthGame, grant: Grant): Problem {
  if (game.phase === 'bid_start') {
    for (const player of game.players) {
      if (!game.startBids[player]) bidStart(game, player, 0, shuffle(COLOURS))
    }
    resolveStart(game, grant)
    return {}
  }
  if (game.phase === 'bid_order') {
    for (const player of game.players) {
      if (!game.orderBids[player]) bidOrder(game, player, 0, game.players[0])
    }
    resolveOrder(game, grant)
    return {}
  }
  return { problem: 'Аукцион не идёт' }
}

// ---------- dealing and play ----------

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function deal(game: LabyrinthGame): LabyrinthGame {
  const pile = shuffle(LETTERS)
  game.decks = {}
  game.hands = {}
  game.collected = {}
  game.visited = {}
  game.pawns = {}
  game.order.forEach((player, i) => {
    const deck = pile.slice(i * DECK_SIZE, (i + 1) * DECK_SIZE)
    game.hands[player] = deck.slice(0, HAND_SIZE)
    game.decks[player] = deck.slice(HAND_SIZE)
    game.collected[player] = []
    game.visited[player] = []
    game.pawns[player] = BASE_OF[game.colours[player]]
  })
  game.phase = 'play'
  game.turn = game.order[0]
  game.turnStartedAt = new Date().toISOString()
  game.step = 'shove'
  log(game, 'setup', 'Карты розданы, охота началась.')
  return game
}

export function deadlineOf(game: LabyrinthGame): { player: string; deadline: number } | null {
  if (game.phase !== 'play' || !game.turn || !game.turnStartedAt) return null
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS }
}

function nextTurn(game: LabyrinthGame): void {
  const i = game.order.indexOf(game.turn as string)
  game.turn = game.order[(i + 1) % game.order.length]
  game.turnStartedAt = new Date().toISOString()
  game.step = 'shove'
}

export function applyClock(game: LabyrinthGame, now = Date.now()): LabyrinthGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  log(game, 'move', `${limit.player} не успел до дедлайна, ход пропущен.`)
  nextTurn(game)
  return game
}

export interface Problem { problem?: string }

/** Sliding a line back the way it just came is not allowed. */
export function gateAllowed(game: LabyrinthGame, gateId: number): boolean {
  return game.lastGate === null || OPPOSITE_GATE[gateId] !== game.lastGate
}

export function doShove(game: LabyrinthGame, player: string, gateId: number, orient: Orient): Problem {
  if (game.phase !== 'play' || game.turn !== player) return { problem: 'Сейчас не ваш ход' }
  if (game.step !== 'shove') return { problem: 'Вы уже сдвинули лабиринт' }
  const gate = gateById(gateId)
  if (!gate) return { problem: 'Такого входа нет' }
  if (!gateAllowed(game, gateId)) return { problem: 'Нельзя толкать линию обратно' }

  const result = shove(game.tiles, game.letters, game.pawns, gate, orient)
  game.tiles = result.tiles
  game.letters = result.letters
  game.pawns = result.pawns
  game.active = result.ejected
  game.lastGate = gateId
  game.step = 'move'
  log(game, 'shove', `${player} вставляет фишку во вход ${gateId}`)
  return {}
}

export function doMove(game: LabyrinthGame, player: string, to: number, grant: Grant): Problem {
  if (game.phase !== 'play' || game.turn !== player) return { problem: 'Сейчас не ваш ход' }
  if (game.step !== 'move') return { problem: 'Сначала сдвиньте лабиринт' }
  const from = game.pawns[player]
  if (!reachable(game.tiles, from).includes(to)) return { problem: 'Туда нет пути' }

  game.pawns = { ...game.pawns, [player]: to }
  if (to !== from) log(game, 'move', `${player} идёт на ${to}`)

  const letter = game.letters[to]
  if (letter && game.hands[player].includes(letter)) {
    game.letters = game.letters.map((l, i) => (i === to ? null : l))
    game.hands = { ...game.hands, [player]: game.hands[player].filter(l => l !== letter) }
    game.collected = { ...game.collected, [player]: [...game.collected[player], letter] }
    const deck = game.decks[player]
    if (deck.length > 0) {
      game.hands = { ...game.hands, [player]: [...game.hands[player], deck[0]] }
      game.decks = { ...game.decks, [player]: deck.slice(1) }
    }
    log(game, 'chest', `${player} забирает сундук ${letter} (${game.collected[player].length} из ${DECK_SIZE})`)
  }

  // standing on a rival's corner counts towards the opal challenge
  for (const colour of COLOURS) {
    if (BASE_OF[colour] !== to) continue
    if (game.colours[player] === colour) continue
    if (!game.visited[player].includes(colour)) {
      game.visited = { ...game.visited, [player]: [...game.visited[player], colour] }
    }
  }

  if (game.collected[player].length === DECK_SIZE && to === BASE_OF[game.colours[player]]) {
    finish(game, player, grant)
    return {}
  }

  nextTurn(game)
  return {}
}

const cardsLeft = (game: LabyrinthGame, player: string): number =>
  (game.decks[player]?.length ?? 0) + (game.hands[player]?.length ?? 0)

export function ecCandidates(game: LabyrinthGame): string[] {
  const losers = game.players.filter(p => p !== game.winner)
  const most = Math.max(...losers.map(p => cardsLeft(game, p)))
  return losers.filter(p => cardsLeft(game, p) === most)
}

function finish(game: LabyrinthGame, winner: string, grant: Grant): void {
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `${winner} собрал все сундуки и вернулся домой.`)

  if (!game.paid) {
    const psigems: Record<string, number> = {}
    for (const p of game.players) psigems[p] = game.collected[p].length * PSIGEMS_PER_CHEST
    psigems[winner] += PSIGEMS_FOR_WIN
    grant('psigems', psigems)
    grant('tol', { [winner]: 1 })

    // the opal goes to whoever toured all three rival corners with the fewest cards left
    const tourists = game.players.filter(p => game.visited[p].length === COLOURS.length - 1)
    if (tourists.length > 0) {
      const fewest = Math.min(...tourists.map(p => cardsLeft(game, p)))
      const best = tourists.filter(p => cardsLeft(game, p) === fewest)
      if (best.length === 1) {
        grant('opals', { [best[0]]: 1 })
        log(game, 'end', `${best[0]} прошёл все три чужие базы и берёт опал.`)
      } else {
        log(game, 'end', 'Опал не достался никому: ничья по картам.')
      }
    }
    game.paid = true
  }

  const candidates = ecCandidates(game)
  if (candidates.length === 1) {
    game.ec = candidates[0]
    game.phase = 'finished'
    log(game, 'end', `EC: ${game.ec}`)
  } else {
    game.phase = 'pick_ec'
    log(game, 'end', `Ничья по картам, ${winner} выбирает EC из: ${candidates.join(', ')}`)
  }
}

export function chooseEc(game: LabyrinthGame, player: string, target: string): Problem {
  if (game.phase !== 'pick_ec') return { problem: 'Сейчас EC не выбирают' }
  if (player !== game.winner) return { problem: 'Выбирает победитель' }
  if (!ecCandidates(game).includes(target)) return { problem: 'Этот игрок не в списке' }
  game.ec = target
  game.phase = 'finished'
  log(game, 'end', `EC: ${target}`)
  return {}
}

// ---------- what a viewer sees ----------

export interface LabView {
  id: string
  name: string
  phase: LabPhase
  players: string[]
  colours: Record<string, Colour>
  order: string[]
  tiles: Orient[]
  letters: (string | null)[]
  pawns: Record<string, number>
  active: Orient
  lastGate: number | null
  blockedGate: number | null
  turn: string | null
  step: LabStep
  deadline: number | null
  hand: string[]
  deckLeft: number
  collected: Record<string, string[]>
  cardsLeft: Record<string, number>
  visited: string[]
  moves: number[]
  winner: string | null
  ec: string | null
  ecChoices: string[]
  bidPlaced: boolean
  bidsIn: number
  isPlayer: boolean
  log: LabLogEntry[]
}

export function viewFor(game: LabyrinthGame, username: string): LabView {
  const limit = deadlineOf(game)
  const isPlayer = game.players.includes(username)
  const mine = game.turn === username && game.phase === 'play'
  const bids = game.phase === 'bid_start' ? game.startBids : game.orderBids

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    colours: game.colours,
    order: game.order,
    tiles: game.tiles,
    letters: game.letters,
    pawns: game.pawns,
    active: game.active,
    lastGate: game.lastGate,
    blockedGate: game.lastGate === null ? null : OPPOSITE_GATE[game.lastGate],
    turn: game.turn,
    step: game.step,
    deadline: limit?.deadline ?? null,
    // a hunter only ever sees the chests in their own hand
    hand: isPlayer ? game.hands[username] ?? [] : [],
    deckLeft: isPlayer ? game.decks[username]?.length ?? 0 : 0,
    collected: game.collected,
    cardsLeft: Object.fromEntries(game.players.map(p => [p, cardsLeft(game, p)])),
    visited: isPlayer ? game.visited[username] ?? [] : [],
    moves: mine && game.step === 'move' ? reachable(game.tiles, game.pawns[username]) : [],
    winner: game.winner,
    ec: game.ec,
    ecChoices: game.phase === 'pick_ec' ? ecCandidates(game) : [],
    bidPlaced: !!bids[username],
    bidsIn: Object.keys(bids).length,
    isPlayer,
    log: game.log,
  }
}
