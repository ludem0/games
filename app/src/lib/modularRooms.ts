import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Three Modular Rooms: nine players, eleven rounds, twelve cards each. Everyone
// picks a card and a room, the card powers fire in a fixed order, and the room
// with the biggest total pays its occupants a point.

const PATH = join(process.cwd(), 'modularrooms.json')

export const ROUNDS = 11
export const ROUND_MS = 24 * 60 * 60 * 1000
export const CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, -10, -11, -12]
export const EXTRA_CARD_COST = 5
export const HIDE_COST = 3
export const BONUS = 1.5
export const BIG_BONUS = 2

export type RoomId = 'null' | 'solitary' | 'duel'
export const ROOMS: RoomId[] = ['null', 'solitary', 'duel']
export const ROOM_NAMES: Record<RoomId, string> = {
  null: 'Null', solitary: 'Solitary', duel: 'Duel',
}
/** each room pays its bonus when the room total leaves this remainder mod three */
export const ROOM_TARGET: Record<RoomId, number> = { null: 0, solitary: 1, duel: 2 }

export type TmrPhase = 'setup' | 'live' | 'finished'

export interface TmrPlay {
  card: number
  room: RoomId
  /** filled in by the deadline instead of by the player, so it cannot score */
  auto: boolean
}

export interface RoomResult {
  players: string[]
  values: number[]
  multiplier: number
  bonus: boolean
  score: number
}

export interface TmrResolution {
  rooms: Record<RoomId, RoomResult>
  scorers: string[]
  extra: Record<string, number>
  garnets: Record<string, number>
  /** what the minus twelve card showed its holder */
  knowledge: Record<string, number[]>
  opal: string[]
}

export interface TmrRound {
  number: number
  deadline: string
  plays: Record<string, TmrPlay>
  hidden: string[]
  resolution: TmrResolution | null
}

export interface TmrLogEntry {
  at: string
  text: string
  kind: 'setup' | 'round' | 'score' | 'buy' | 'end'
}

export interface ModularRoomsGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: TmrPhase
  players: string[]
  hands: Record<string, number[]>
  points: Record<string, number>
  /** cards bought this round, handed over when the next one opens */
  pending: Record<string, number[]>
  rounds: TmrRound[]
  /** private notes, mostly what the minus twelve card revealed */
  notes: Record<string, string[]>
  opalWinners: string[]
  paidOut?: boolean
  log: TmrLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, ModularRoomsGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, ModularRoomsGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): ModularRoomsGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: ModularRoomsGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): ModularRoomsGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: ModularRoomsGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup',
    players: [], hands: {}, points: {}, pending: {},
    rounds: [], notes: {}, opalWinners: [],
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: ModularRoomsGame): ModularRoomsGame {
  return {
    ...game,
    phase: 'setup',
    players: [], hands: {}, points: {}, pending: {},
    rounds: [], notes: {}, opalWinners: [], paidOut: false, log: [],
  }
}

function log(game: ModularRoomsGame, kind: TmrLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

function note(game: ModularRoomsGame, player: string, text: string): void {
  game.notes = { ...game.notes, [player]: [...(game.notes[player] ?? []), text] }
}

export function currentRound(game: ModularRoomsGame): TmrRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

// ---------- resolving a round ----------

interface Slot {
  player: string
  card: number
  room: RoomId
  /** the value this card currently shows, which powers may change */
  value: number
  ignored: boolean
  auto: boolean
}

const lastDigit = (n: number): number => Math.abs(n) % 10
const mod3 = (n: number): number => ((Math.round(n) % 3) + 3) % 3

/**
 * Plays out one round: powers fire from the smallest card to the largest by
 * absolute value, then each room takes its bonus and the best room pays.
 */
export function resolveRound(
  game: ModularRoomsGame,
  round: TmrRound,
  balances: Record<string, number>,
): TmrResolution {
  const slots: Slot[] = game.players.map(player => {
    const play = round.plays[player]
    return { player, card: play.card, room: play.room, value: play.card, ignored: false, auto: play.auto }
  })

  const inRoom = (room: RoomId): Slot[] => slots.filter(s => s.room === room)
  const extra: Record<string, number> = {}
  const garnets: Record<string, number> = {}
  const knowledge: Record<string, number[]> = {}
  const multipliers: Record<RoomId, number> = { null: BONUS, solitary: BONUS, duel: BONUS }

  const sumOf = (room: RoomId): number => inRoom(room).reduce((total, s) => total + s.value, 0)

  for (const card of CARDS) {
    for (const slot of slots.filter(s => s.card === card)) {
      if (slot.ignored) continue
      const room = slot.room
      const mates = inRoom(room)

      if (card === 1) {
        const highest = Math.max(...mates.map(s => s.value))
        for (const mate of mates) if (mate.value === highest) mate.value = -mate.value
      }

      if (card === 2) {
        // duplicates lose their powers, and a doubled two spreads that everywhere
        const doubled = mates.filter(s => s.card === 2).length > 1
        const scope = doubled ? slots : mates
        const counts = new Map<number, number>()
        for (const s of scope) counts.set(s.card, (counts.get(s.card) ?? 0) + 1)
        for (const s of scope) {
          if (s.card !== 2 && (counts.get(s.card) ?? 0) > 1) s.ignored = true
        }
      }

      if (card === 3 && mates.length === 1) slot.value = 30

      if (card === 4) {
        const digit = lastDigit(sumOf(room))
        for (const s of slots) if (lastDigit(s.card) === digit) s.ignored = true
      }

      if (card === 5 && ROOMS.some(r => inRoom(r).length === 0)) {
        extra[slot.player] = (extra[slot.player] ?? 0) + 1
      }

      if (card === 6) {
        const total = sumOf(room)
        if (total % 5 === 0) {
          slots.push({ player: slot.player, card: 6, room, value: 15, ignored: true, auto: false })
        }
        if (total % 7 === 0) {
          slots.push({ player: slot.player, card: 6, room, value: -14, ignored: true, auto: false })
        }
      }

      if (card === 7) {
        for (const mate of inRoom(room)) mate.value = mate.value >= 0 ? 7 : -7
      }

      if (card === 8) {
        const here = inRoom(room)
        if (here.length > 1) {
          const values = here.map(s => s.value)
          const product = Math.max(...values) * Math.min(...values)
          for (const mate of here) mate.value = 0
          slot.value = product
        }
      }

      if (card === 9 && new Set(mates.map(s => s.player)).size === 3) {
        multipliers[room] = BIG_BONUS
      }

      if (card === -10) {
        for (const mate of mates) {
          if (mate.player === slot.player) continue
          if ((balances[mate.player] ?? 0) + (garnets[mate.player] ?? 0) < 1) continue
          garnets[mate.player] = (garnets[mate.player] ?? 0) - 1
          garnets[slot.player] = (garnets[slot.player] ?? 0) + 1
        }
      }

      if (card === -12) {
        knowledge[slot.player] = slots
          .filter(s => s.room !== room && game.players.includes(s.player))
          .map(s => s.card)
          .sort((a, b) => a - b)
      }
    }
  }

  // the rooms take their bonus, then the biggest total pays
  const rooms = {} as Record<RoomId, RoomResult>
  for (const room of ROOMS) {
    const here = inRoom(room)
    const raw = here.reduce((total, s) => total + s.value, 0)
    const bonus = mod3(raw) === ROOM_TARGET[room] && here.length > 0
    rooms[room] = {
      players: here.filter(s => game.players.includes(s.player)).map(s => s.player),
      values: here.map(s => s.value),
      multiplier: multipliers[room],
      bonus,
      score: bonus ? raw * multipliers[room] : raw,
    }
  }

  // the minus eleven card pays on the final score of its room
  for (const slot of slots.filter(s => s.card === -11 && !s.ignored)) {
    const result = rooms[slot.room]
    if (result.players.length > 1 && result.score >= -15 && result.score <= -5) {
      extra[slot.player] = (extra[slot.player] ?? 0) + 1
    }
  }

  const best = Math.max(...ROOMS.map(r => rooms[r].score))
  const leaders = ROOMS.filter(r => rooms[r].score === best)
  const winningRooms = leaders.length === 2 ? ROOMS.filter(r => !leaders.includes(r)) : leaders
  const scorers = winningRooms
    .flatMap(r => rooms[r].players)
    // a player who never submitted cannot take the point
    .filter(player => !round.plays[player]?.auto)

  // the opal wants exactly one player left out of the bonus
  const missed = game.players.filter(p => !rooms[round.plays[p].room].bonus)
  const opal = missed.length === 1 ? missed : []

  return { rooms, scorers, extra, garnets, knowledge, opal }
}

// ---------- the match ----------

export type Charge = (player: string, amount: number) => void

function openRound(game: ModularRoomsGame): void {
  const number = game.rounds.length + 1
  for (const player of game.players) {
    const bought = game.pending[player] ?? []
    if (bought.length > 0) {
      game.hands = { ...game.hands, [player]: [...(game.hands[player] ?? []), ...bought] }
      game.pending = { ...game.pending, [player]: [] }
    }
  }
  game.rounds = [...game.rounds, {
    number,
    deadline: new Date(Date.now() + ROUND_MS).toISOString(),
    plays: {},
    hidden: [],
    resolution: null,
  }]
  log(game, 'round', `Раунд ${number} из ${ROUNDS} открыт.`)
}

export function startGame(game: ModularRoomsGame, players: string[]): ModularRoomsGame {
  game.players = players
  game.hands = Object.fromEntries(players.map(p => [p, [...CARDS]]))
  game.points = Object.fromEntries(players.map(p => [p, 0]))
  game.pending = Object.fromEntries(players.map(p => [p, []]))
  game.rounds = []
  game.phase = 'live'
  openRound(game)
  log(game, 'setup', `Матч начался. Игроков: ${players.length}.`)
  return game
}

export function submitPlay(
  game: ModularRoomsGame, player: string, card: number, room: RoomId,
): ModularRoomsGame {
  const round = currentRound(game)
  if (!round) return game
  round.plays = { ...round.plays, [player]: { card, room, auto: false } }
  return game
}

function randomOf<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Closes the round: silence is filled in at random and scores nothing. */
export function closeRound(
  game: ModularRoomsGame, balances: Record<string, number>, charge: Charge,
): ModularRoomsGame {
  const round = currentRound(game)
  if (!round || round.resolution) return game

  for (const player of game.players) {
    const play = round.plays[player]
    const hand = game.hands[player] ?? []
    if (play && hand.includes(play.card)) continue
    round.plays = {
      ...round.plays,
      [player]: {
        card: randomOf(hand.length > 0 ? hand : CARDS),
        room: play?.room ?? randomOf(ROOMS),
        auto: true,
      },
    }
    log(game, 'round', `${player} не сдал ход, карта и комната выбраны случайно.`)
  }

  const resolution = resolveRound(game, round, balances)
  round.resolution = resolution

  for (const player of game.players) {
    game.hands = {
      ...game.hands,
      [player]: removeOne(game.hands[player] ?? [], round.plays[player].card),
    }
  }

  for (const player of resolution.scorers) {
    game.points = { ...game.points, [player]: (game.points[player] ?? 0) + 1 }
  }
  for (const [player, points] of Object.entries(resolution.extra)) {
    game.points = { ...game.points, [player]: (game.points[player] ?? 0) + points }
  }
  for (const [player, amount] of Object.entries(resolution.garnets)) {
    charge(player, -amount)
  }
  for (const [player, cards] of Object.entries(resolution.knowledge)) {
    note(game, player, `Раунд ${round.number}: в других комнатах лежали ${cards.join(', ')}.`)
  }
  for (const player of resolution.opal) {
    game.opalWinners = [...game.opalWinners, player]
    note(game, player, `Раунд ${round.number}: вы единственный остались без бонуса комнаты.`)
  }

  log(game, 'score', `Раунд ${round.number}: ` +
    ROOMS.map(r => `${ROOM_NAMES[r]} ${resolution.rooms[r].score}`).join(', ') +
    `. Очко получают: ${resolution.scorers.join(', ') || 'никто'}.`)

  if (game.rounds.length >= ROUNDS) return finish(game)
  openRound(game)
  return game
}

function removeOne(hand: number[], card: number): number[] {
  const index = hand.indexOf(card)
  return index < 0 ? hand : hand.filter((_, i) => i !== index)
}

export function finish(game: ModularRoomsGame): ModularRoomsGame {
  game.phase = 'finished'
  const best = Math.max(...game.players.map(p => game.points[p] ?? 0))
  const winners = game.players.filter(p => (game.points[p] ?? 0) === best)
  log(game, 'end', `Матч окончен. Больше всех очков: ${winners.join(', ')}.`)
  return game
}

export function winnersOf(game: ModularRoomsGame): string[] {
  if (game.players.length === 0) return []
  const best = Math.max(...game.players.map(p => game.points[p] ?? 0))
  return game.players.filter(p => (game.points[p] ?? 0) === best)
}

export function losersOf(game: ModularRoomsGame): string[] {
  if (game.players.length === 0) return []
  const worst = Math.min(...game.players.map(p => game.points[p] ?? 0))
  return game.players.filter(p => (game.points[p] ?? 0) === worst)
}

export interface TmrPayout {
  psigems: Record<string, number>
  tol: Record<string, number>
  opals: Record<string, number>
}

/**
 * A point is worth a psigem, the winners take a token of life each, and a lone
 * winner takes two and an opal. The opal challenge pays psigems when shared.
 */
export function payoutFor(game: ModularRoomsGame): TmrPayout {
  const psigems: Record<string, number> = {}
  const tol: Record<string, number> = {}
  const opals: Record<string, number> = {}

  for (const player of game.players) {
    const points = game.points[player] ?? 0
    if (points > 0) psigems[player] = points
  }

  const winners = winnersOf(game)
  if (winners.length === 1) {
    tol[winners[0]] = 2
    opals[winners[0]] = 1
  } else {
    for (const player of winners) tol[player] = 1
  }

  const claimants = [...new Set(game.opalWinners)]
  if (claimants.length === 1) {
    opals[claimants[0]] = (opals[claimants[0]] ?? 0) + 1
  } else {
    for (const player of claimants) psigems[player] = (psigems[player] ?? 0) + 3
  }
  return { psigems, tol, opals }
}

export function applyClock(
  game: ModularRoomsGame, balances: Record<string, number>, charge: Charge, now = Date.now(),
): ModularRoomsGame {
  if (game.phase !== 'live') return game
  const round = currentRound(game)
  if (!round || round.resolution || now < new Date(round.deadline).getTime()) return game
  return closeRound(game, balances, charge)
}

// ---------- what a viewer sees ----------

export interface TmrRoomReport {
  players: string[]
  count: number
  score: number
  bonus: boolean
  multiplier: number
}

export interface TmrRoundReport {
  number: number
  rooms: Record<RoomId, TmrRoomReport>
  scorers: string[]
}

export interface TmrView {
  id: string
  name: string
  phase: TmrPhase
  players: string[]
  points: Record<string, number>
  roundNumber: number
  deadline: string | null
  myHand: number[]
  myPlay: TmrPlay | null
  submitted: string[]
  /** the rooms as they were last time, which is all anybody sees */
  lastRound: TmrRoundReport | null
  notes: string[]
  amPlayer: boolean
  winner: string[]
  payout: TmrPayout | null
  log: TmrLogEntry[]
}

export function viewFor(game: ModularRoomsGame, username: string): TmrView {
  const round = currentRound(game)
  const previous = [...game.rounds].reverse().find(r => r.resolution) ?? null

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    points: game.points,
    roundNumber: round?.number ?? 0,
    deadline: round && !round.resolution ? round.deadline : null,
    myHand: game.hands[username] ?? [],
    myPlay: round?.plays[username] ?? null,
    submitted: round ? Object.keys(round.plays) : [],
    lastRound: previous?.resolution ? {
      number: previous.number,
      rooms: Object.fromEntries(ROOMS.map(room => {
        const result = previous.resolution!.rooms[room]
        // paying to hide keeps the names out of the report, never the count
        const hidden = previous.hidden.length > 0
        return [room, {
          players: hidden ? [] : result.players,
          count: result.players.length,
          score: result.score,
          bonus: result.bonus,
          multiplier: result.multiplier,
        }]
      })) as Record<RoomId, TmrRoomReport>,
      scorers: previous.resolution.scorers,
    } : null,
    notes: game.notes[username] ?? [],
    amPlayer: game.players.includes(username),
    winner: game.phase === 'finished' ? winnersOf(game) : [],
    payout: game.phase === 'finished' ? payoutFor(game) : null,
    log: game.log,
  }
}
