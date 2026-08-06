import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  resolveRound, pickIsLegal, randomPick, psigemsForPoints,
  ROWS, COLS, TARGET_POINTS, UNIQUE_BONUS_LIMIT,
  type Cell, type Pick, type RoundOutcome, type Sign, type Colour,
} from './doubleTeamScoring'

const PATH = join(process.cwd(), 'doubleteam.json')

export const IMMUNITY_COST = 3
export const MESSAGE_COST = 1
export const MESSAGE_LIMIT = 400
export const DEFAULT_ROUND_HOURS = 24

export interface DtPlayer {
  username: string
  letter: string
  row: number
  col: number
}

export interface DtRound {
  number: number
  status: 'open' | 'resolved'
  deadline: string | null
  picks: Record<string, Pick & { random?: boolean }>
  immune: string[]
  outcome: RoundOutcome | null
}

export interface DoubleTeamGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  status: 'setup' | 'active' | 'finished'
  players: DtPlayer[]
  rounds: DtRound[]
  points: Record<string, number>
  /** how many unique symbol psigems each player has already banked */
  uniqueBonuses: Record<string, number>
  /** identity guesses for the opal challenge: letter by letter */
  opalGuesses: Record<string, { guess: Record<string, string>; at: string; correct: boolean }>
  winners: string[]
  log: { at: string; text: string }[]
  createdAt: string
}

function readAll(): Record<string, DoubleTeamGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, DoubleTeamGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): DoubleTeamGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: DoubleTeamGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): DoubleTeamGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: DoubleTeamGame = {
    id: slug, seasonSlug, matchId, name,
    status: 'setup',
    players: [], rounds: [], points: {}, uniqueBonuses: {}, opalGuesses: {},
    winners: [], log: [],
    createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

function log(game: DoubleTeamGame, text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text }]
}

// ---------- grid ----------

/**
 * Seat everyone at random. Identity letters come from the deathmatch where they
 * were handed out; anyone without one gets a free letter.
 */
export function buildGrid(
  game: DoubleTeamGame, roster: string[], knownLetters: Record<string, string>,
): DoubleTeamGame {
  const seats = [...roster].slice(0, ROWS * COLS)
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[seats[i], seats[j]] = [seats[j], seats[i]]
  }

  const taken = new Set(Object.values(knownLetters))
  const spare = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !taken.has(l))

  game.players = seats.map((username, i) => ({
    username,
    letter: knownLetters[username] ?? spare.shift() ?? '?',
    row: Math.floor(i / COLS),
    col: i % COLS,
  }))
  game.points = Object.fromEntries(seats.map(p => [p, 0]))
  game.uniqueBonuses = Object.fromEntries(seats.map(p => [p, 0]))
  log(game, 'Сетка составлена')
  return game
}

export function setLetter(game: DoubleTeamGame, username: string, letter: string): DoubleTeamGame {
  game.players = game.players.map(p => (p.username === username ? { ...p, letter } : p))
  return game
}

/** Everyone who shares a row or a column with this player, themselves excluded. */
export function neighbours(game: DoubleTeamGame, username: string): string[] {
  const me = game.players.find(p => p.username === username)
  if (!me) return []
  return game.players
    .filter(p => p.username !== username && (p.row === me.row || p.col === me.col))
    .map(p => p.username)
}

export function canTalk(game: DoubleTeamGame, a: string, b: string): boolean {
  return neighbours(game, a).includes(b)
}

// ---------- rounds ----------

export function currentRound(game: DoubleTeamGame): DtRound | null {
  const last = game.rounds[game.rounds.length - 1]
  return last && last.status === 'open' ? last : null
}

export function openRound(game: DoubleTeamGame, hours: number): DoubleTeamGame {
  const number = game.rounds.length + 1
  game.rounds = [...game.rounds, {
    number,
    status: 'open',
    deadline: new Date(Date.now() + hours * 3600_000).toISOString(),
    picks: {},
    immune: [],
    outcome: null,
  }]
  game.status = 'active'
  log(game, `Раунд ${number} открыт`)
  return game
}

/** Picks a player made before, newest first, used for the repeat rules. */
export function historyOf(game: DoubleTeamGame, username: string): Pick[] {
  return [...game.rounds]
    .filter(r => r.status === 'resolved')
    .reverse()
    .map(r => r.picks[username])
    .filter((p): p is Pick => !!p)
}

export function submitPick(game: DoubleTeamGame, username: string, pick: Pick): DoubleTeamGame {
  const round = currentRound(game)
  if (!round) return game
  round.picks = { ...round.picks, [username]: pick }
  return game
}

export function buyImmunity(game: DoubleTeamGame, username: string): DoubleTeamGame {
  const round = currentRound(game)
  if (!round || round.immune.includes(username)) return game
  round.immune = [...round.immune, username]
  log(game, `${username} купил иммунитет на раунд ${round.number}`)
  return game
}

/**
 * Close the round: anyone who stayed silent is dealt a random legal symbol, the
 * grid is judged, points and the unique symbol bonus are handed out.
 */
export function closeRound(game: DoubleTeamGame): { game: DoubleTeamGame; psigemGrants: Record<string, number> } {
  const round = currentRound(game)
  if (!round) return { game, psigemGrants: {} }

  for (const player of game.players) {
    if (!round.picks[player.username]) {
      round.picks[player.username] = { ...randomPick(historyOf(game, player.username)), random: true }
    }
  }

  const cells: Cell[] = game.players.map(p => ({
    username: p.username,
    row: p.row,
    col: p.col,
    sign: round.picks[p.username].sign,
    colour: round.picks[p.username].colour,
  }))

  const outcome = resolveRound(cells, round.immune)
  round.outcome = outcome
  round.status = 'resolved'

  for (const username of outcome.scored) {
    game.points = { ...game.points, [username]: (game.points[username] ?? 0) + 1 }
  }

  const psigemGrants: Record<string, number> = {}
  if (outcome.uniqueBonus) {
    const banked = game.uniqueBonuses[outcome.uniqueBonus] ?? 0
    if (banked < UNIQUE_BONUS_LIMIT) {
      game.uniqueBonuses = { ...game.uniqueBonuses, [outcome.uniqueBonus]: banked + 1 }
      psigemGrants[outcome.uniqueBonus] = 1
      log(game, `${outcome.uniqueBonus} единственный с уникальным символом и получает псигем`)
    }
  }

  log(game, `Раунд ${round.number} подсчитан: ${outcome.scored.length ? outcome.scored.join(', ') : 'никто'} набрали очко`)

  const leaders = game.players
    .map(p => p.username)
    .filter(u => (game.points[u] ?? 0) >= TARGET_POINTS)
  if (leaders.length > 0) {
    game.winners = leaders
    game.status = 'finished'
    log(game, `Матч окончен. Победители: ${leaders.join(', ')}`)
  }

  return { game, psigemGrants }
}

/** Psigems for the final standings, paid once the match is over. */
export function finalPsigems(game: DoubleTeamGame): Record<string, number> {
  return Object.fromEntries(
    game.players.map(p => [p.username, psigemsForPoints(game.points[p.username] ?? 0)]),
  )
}

export function losers(game: DoubleTeamGame): string[] {
  if (game.players.length === 0) return []
  const lowest = Math.min(...game.players.map(p => game.points[p.username] ?? 0))
  return game.players.filter(p => (game.points[p.username] ?? 0) === lowest).map(p => p.username)
}

// ---------- opal challenge ----------

/** A guess maps every player name to the letter they are thought to hold. */
export function submitOpalGuess(
  game: DoubleTeamGame, username: string, guess: Record<string, string>,
): DoubleTeamGame {
  const correct = game.players.every(p => (guess[p.username] ?? '').toUpperCase() === p.letter)
  game.opalGuesses = {
    ...game.opalGuesses,
    [username]: { guess, at: new Date().toISOString(), correct },
  }
  return game
}

export function opalResult(game: DoubleTeamGame): { winner: string | null; correctGuessers: string[] } {
  const correctGuessers = Object.entries(game.opalGuesses)
    .filter(([, g]) => g.correct)
    .map(([user]) => user)
  return { winner: correctGuessers.length === 1 ? correctGuessers[0] : null, correctGuessers }
}

// ---------- what a viewer may see ----------

export interface DtView {
  id: string
  name: string
  status: DoubleTeamGame['status']
  players: { username: string; letter: string; row: number; col: number }[]
  points: Record<string, number>
  uniqueBonuses: Record<string, number>
  rounds: DtRound[]
  winners: string[]
  log: { at: string; text: string }[]
  myPick: (Pick & { random?: boolean }) | null
  myHistory: Pick[]
  myNeighbours: string[]
  iAmImmune: boolean
  isPlayer: boolean
  /** the current round hides everyone else's pick until it is resolved */
  openRoundNumber: number | null
  openDeadline: string | null
  submittedCount: number
  myOpalGuess: Record<string, string> | null
  opalCorrectCount: number | null
}

export function viewFor(game: DoubleTeamGame, username: string, isAdmin: boolean): DtView {
  const round = currentRound(game)
  const isPlayer = game.players.some(p => p.username === username)

  const rounds = game.rounds.map(r => {
    if (r.status === 'resolved') return r
    // while a round is open only the viewer's own pick is visible
    const picks = isAdmin
      ? r.picks
      : Object.fromEntries(Object.entries(r.picks).filter(([u]) => u === username))
    return { ...r, picks }
  })

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    players: game.players,
    points: game.points,
    uniqueBonuses: game.uniqueBonuses,
    rounds,
    winners: game.winners,
    log: game.log,
    myPick: round?.picks[username] ?? null,
    myHistory: historyOf(game, username),
    myNeighbours: neighbours(game, username),
    iAmImmune: round?.immune.includes(username) ?? false,
    isPlayer,
    openRoundNumber: round?.number ?? null,
    openDeadline: round?.deadline ?? null,
    submittedCount: round ? Object.keys(round.picks).length : 0,
    myOpalGuess: game.opalGuesses[username]?.guess ?? null,
    opalCorrectCount: isAdmin ? opalResult(game).correctGuessers.length : null,
  }
}

export { ROWS, COLS, TARGET_POINTS }
export type { Pick, Sign, Colour, RoundOutcome }
