import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { BOARD, COLUMNS, ROWS, PUZZLE_TYPES, type PuzzleType } from './chambersBoard'

// Puzzle Sum Chambers: three players, fifty puzzles and three towers. Solving a
// puzzle wins a psigem and the right to push its number onto any tower, where
// certain totals pay out and others cost.

const PATH = join(process.cwd(), 'puzzlechambers.json')

export { COLUMNS, ROWS, BOARD, PUZZLE_TYPES } from './chambersBoard'
export type { PuzzleType } from './chambersBoard'

export const TOWER_MAX = 200
export const SOLVE_MS = 8 * 60 * 1000     // eight minutes on a puzzle
export const PLACE_MS = 2 * 60 * 1000     // two on placing and picking
export const TALLEST_PRIZE = 5
export const OPAL_TARGET = 200

/** What a tower total is worth the moment it is reached. */
export function payoutForTotal(total: number): number {
  if (total === 0 || total === 100) return 2
  if (total === 50 || total === 150) return 1
  if (total === 200) return 3
  if (total > 0 && total < 200 && total % 20 === 0) return -2
  return 0
}

export type PscPhase = 'setup' | 'picking' | 'solving' | 'placing' | 'finished'

export interface PscPuzzle {
  number: number
  type: PuzzleType
  /** the host writes these before the match */
  question: string
  answer: string
  attempted: boolean
  solvedBy: string | null
}

export interface PscLogEntry {
  at: string
  text: string
  kind: 'setup' | 'pick' | 'solve' | 'tower' | 'end'
}

export interface PuzzleChambersGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: PscPhase
  players: string[]
  towers: Record<string, number>
  /** psigems earned inside this match, so the result can be read at a glance */
  earned: Record<string, number>
  startingPsigems: Record<string, number>
  puzzles: PscPuzzle[]
  active: string | null
  /** the puzzle on the table and the guesses made at it */
  current: number | null
  guesses: Record<string, { text: string; correct: boolean; at: string }>
  deadline: string | null
  /** everyone who has had a tower stand at two hundred */
  reachedOpal: string[]
  winner: string | null
  log: PscLogEntry[]
  createdAt: string
}

function readAll(): Record<string, PuzzleChambersGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, PuzzleChambersGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): PuzzleChambersGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: PuzzleChambersGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

function blankPuzzles(): PscPuzzle[] {
  const numbers = BOARD.filter((n): n is number => n != null).sort((a, b) => a - b)
  return numbers.map((number, index) => ({
    number,
    // five of each type, handed out in order until the host says otherwise
    type: PUZZLE_TYPES[Math.floor(index / 5)],
    question: '',
    answer: '',
    attempted: false,
    solvedBy: null,
  }))
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): PuzzleChambersGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: PuzzleChambersGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup',
    players: [], towers: {}, earned: {}, startingPsigems: {},
    puzzles: blankPuzzles(),
    active: null, current: null, guesses: {}, deadline: null,
    reachedOpal: [], winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: PuzzleChambersGame): PuzzleChambersGame {
  return {
    ...game,
    phase: 'setup',
    players: [], towers: {}, earned: {}, startingPsigems: {},
    puzzles: blankPuzzles(),
    active: null, current: null, guesses: {}, deadline: null,
    reachedOpal: [], winner: null, log: [],
  }
}

// ---------- the board ----------

export function squareOf(number: number): number {
  return BOARD.indexOf(number)
}

/** A number may be picked only while it still touches a grey square. */
export function isOpen(game: PuzzleChambersGame, number: number): boolean {
  const puzzle = game.puzzles.find(p => p.number === number)
  if (!puzzle || puzzle.attempted) return false

  const index = squareOf(number)
  const col = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  const grey = (c: number, r: number): boolean => {
    if (c < 0 || c >= COLUMNS || r < 0 || r >= ROWS) return true
    const value = BOARD[r * COLUMNS + c]
    if (value == null) return true
    return !!game.puzzles.find(p => p.number === value)?.attempted
  }
  return grey(col - 1, row) || grey(col + 1, row) || grey(col, row - 1) || grey(col, row + 1)
}

export function openNumbers(game: PuzzleChambersGame): number[] {
  return game.puzzles.filter(p => !p.attempted && isOpen(game, p.number)).map(p => p.number)
}

function log(game: PuzzleChambersGame, kind: PscLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

// ---------- the match ----------

export type Award = (player: string, psigems: number) => void

export function startGame(
  game: PuzzleChambersGame, players: string[], first: string, psigems: Record<string, number>,
): PuzzleChambersGame {
  game.players = players
  game.towers = Object.fromEntries(players.map(p => [p, 0]))
  game.earned = Object.fromEntries(players.map(p => [p, 0]))
  game.startingPsigems = Object.fromEntries(players.map(p => [p, psigems[p] ?? 0]))
  game.phase = 'picking'
  game.active = first
  game.current = null
  game.guesses = {}
  game.deadline = new Date(Date.now() + PLACE_MS).toISOString()
  log(game, 'setup', `Матч начался. Первым выбирает ${first}.`)
  return game
}

export function pickPuzzle(game: PuzzleChambersGame, number: number): PuzzleChambersGame {
  game.current = number
  game.guesses = {}
  game.phase = 'solving'
  game.deadline = new Date(Date.now() + SOLVE_MS).toISOString()
  const puzzle = game.puzzles.find(p => p.number === number)
  log(game, 'pick', `${game.active} открывает задачу ${number} (${puzzle?.type ?? '?'}).`)
  return game
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

/**
 * One guess each. The first correct answer takes a psigem and the right to move
 * a tower; if nobody gets it the puzzle still burns.
 */
export function guess(
  game: PuzzleChambersGame, player: string, text: string, award: Award,
): PuzzleChambersGame {
  const puzzle = game.puzzles.find(p => p.number === game.current)
  if (!puzzle) return game

  const correct = normalise(puzzle.answer) !== '' && normalise(text) === normalise(puzzle.answer)
  const alreadySolved = Object.values(game.guesses).some(g => g.correct)
  game.guesses = { ...game.guesses, [player]: { text, correct, at: new Date().toISOString() } }

  if (correct && !alreadySolved) {
    puzzle.solvedBy = player
    award(player, 1)
    game.earned = { ...game.earned, [player]: (game.earned[player] ?? 0) + 1 }
    game.active = player
    log(game, 'solve', `${player} решает задачу ${puzzle.number} и получает псигем.`)
    return openPlacement(game, puzzle)
  }

  // everyone has spoken and nobody was right
  if (game.players.every(p => game.guesses[p])) {
    log(game, 'solve', `Задачу ${puzzle.number} никто не решил.`)
    return burn(game, puzzle, award)
  }
  return game
}

function openPlacement(game: PuzzleChambersGame, puzzle: PscPuzzle): PuzzleChambersGame {
  puzzle.attempted = true
  game.phase = 'placing'
  game.deadline = new Date(Date.now() + PLACE_MS).toISOString()
  return game
}

/** A puzzle nobody solved simply turns grey and the same player picks again. */
function burn(game: PuzzleChambersGame, puzzle: PscPuzzle, award: Award): PuzzleChambersGame {
  puzzle.attempted = true
  game.current = null
  game.guesses = {}
  if (game.puzzles.every(p => p.attempted)) return finish(game, award)
  game.phase = 'picking'
  game.deadline = new Date(Date.now() + PLACE_MS).toISOString()
  return game
}

/** Adds or subtracts the puzzle number, then pays whatever the total is worth. */
export function placeOnTower(
  game: PuzzleChambersGame, tower: string, add: boolean, award: Award,
): PuzzleChambersGame {
  const puzzle = game.puzzles.find(p => p.number === game.current)
  if (!puzzle || !game.active) return game
  // a puzzle turns grey once it has been attempted, whatever route got us here
  puzzle.attempted = true

  const before = game.towers[tower] ?? 0
  const after = before + (add ? puzzle.number : -puzzle.number)
  game.towers = { ...game.towers, [tower]: after }
  log(game, 'tower', `${game.active}: башня ${tower} ${add ? '+' : '-'}${puzzle.number} = ${after}.`)

  const payout = payoutForTotal(after)
  if (payout > 0) {
    award(tower, payout)
    game.earned = { ...game.earned, [tower]: (game.earned[tower] ?? 0) + payout }
    log(game, 'tower', `${tower} получает ${payout} псигема за сумму ${after}.`)
  } else if (payout < 0) {
    award(tower, payout)
    game.earned = { ...game.earned, [tower]: (game.earned[tower] ?? 0) + payout }
    // a tower knocked onto a bad number by somebody else pays that somebody
    if (tower !== game.active) {
      award(game.active, -payout)
      game.earned = { ...game.earned, [game.active]: (game.earned[game.active] ?? 0) - payout }
      log(game, 'tower', `${tower} теряет ${-payout}, их забирает ${game.active}.`)
    } else {
      log(game, 'tower', `${tower} теряет ${-payout}.`)
    }
  }

  if (after === OPAL_TARGET && !game.reachedOpal.includes(tower)) {
    game.reachedOpal = [...game.reachedOpal, tower]
    log(game, 'tower', `Башня ${tower} достигла 200: задача на опал выполнена.`)
  }

  game.current = null
  game.guesses = {}
  if (game.puzzles.every(p => p.attempted)) return finish(game, award)
  game.phase = 'picking'
  game.deadline = new Date(Date.now() + PLACE_MS).toISOString()
  return game
}

/** The tallest tower is worth five, and a tie hands them to whoever is alone. */
export function tallestPrize(towers: Record<string, number>): string[] {
  const players = Object.keys(towers)
  const best = Math.max(...players.map(p => towers[p] ?? 0))
  const leaders = players.filter(p => (towers[p] ?? 0) === best)
  if (leaders.length === 1) return leaders
  if (leaders.length === players.length) return players
  return players.filter(p => !leaders.includes(p))
}

export function finish(game: PuzzleChambersGame, award: Award): PuzzleChambersGame {
  for (const player of tallestPrize(game.towers)) {
    award(player, TALLEST_PRIZE)
    game.earned = { ...game.earned, [player]: (game.earned[player] ?? 0) + TALLEST_PRIZE }
  }
  game.phase = 'finished'
  game.current = null
  game.deadline = null
  game.winner = standings(game)[0]?.player ?? null
  log(game, 'end', `Матч окончен. Победа: ${game.winner}.`)
  return game
}

/**
 * Final order by psigems held. A tie is broken in favour of whoever started the
 * match with fewer, since they gained more inside it.
 */
export function standings(game: PuzzleChambersGame): { player: string; total: number; earned: number }[] {
  return game.players
    .map(player => ({
      player,
      total: (game.startingPsigems[player] ?? 0) + (game.earned[player] ?? 0),
      earned: game.earned[player] ?? 0,
    }))
    .sort((a, b) => (b.total - a.total)
      || ((game.startingPsigems[a.player] ?? 0) - (game.startingPsigems[b.player] ?? 0)))
}

/** Two players at two hundred share clear opals, three players cancel it out. */
export function opalAward(game: PuzzleChambersGame): string[] {
  return game.reachedOpal.length === 2 ? game.reachedOpal : []
}

export function applyClock(game: PuzzleChambersGame, award: Award, now = Date.now()): PuzzleChambersGame {
  if (!game.deadline || game.phase === 'finished' || game.phase === 'setup') return game
  if (now < new Date(game.deadline).getTime()) return game

  const puzzle = game.puzzles.find(p => p.number === game.current)
  if (game.phase === 'solving' && puzzle) {
    const solver = Object.entries(game.guesses).find(([, g]) => g.correct)?.[0]
    if (solver) return openPlacement(game, puzzle)
    log(game, 'solve', `Время на задачу ${puzzle.number} вышло.`)
    return burn(game, puzzle, award)
  }
  if (game.phase === 'placing' && puzzle && game.active) {
    // silence adds the number to the active player's own tower
    log(game, 'tower', `${game.active} не успел выбрать башню, число идёт в свою.`)
    return placeOnTower(game, game.active, true, award)
  }
  if (game.phase === 'picking') {
    const open = openNumbers(game)
    if (open.length === 0) return finish(game, award)
    log(game, 'pick', 'Время на выбор вышло, задача берётся сама.')
    return pickPuzzle(game, open[0])
  }
  return game
}

// ---------- what a viewer sees ----------

export interface PscView {
  id: string
  name: string
  phase: PscPhase
  players: string[]
  towers: Record<string, number>
  earned: Record<string, number>
  board: { number: number; type: PuzzleType; attempted: boolean; open: boolean; solvedBy: string | null }[]
  active: string | null
  current: { number: number; type: PuzzleType; question: string } | null
  myGuess: { text: string; correct: boolean } | null
  guessed: string[]
  deadline: string | null
  reachedOpal: string[]
  standings: { player: string; total: number; earned: number }[]
  winner: string | null
  amPlayer: boolean
  /** admin only: the answers, so the host can check the sheet */
  answers: Record<number, string> | null
  log: PscLogEntry[]
}

export function viewFor(game: PuzzleChambersGame, username: string, isAdmin: boolean): PscView {
  const puzzle = game.puzzles.find(p => p.number === game.current) ?? null

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    towers: game.towers,
    earned: game.earned,
    board: game.puzzles.map(p => ({
      number: p.number,
      type: p.type,
      attempted: p.attempted,
      open: isOpen(game, p.number),
      solvedBy: p.solvedBy,
    })),
    active: game.active,
    current: puzzle ? { number: puzzle.number, type: puzzle.type, question: puzzle.question } : null,
    myGuess: game.guesses[username] ?? null,
    guessed: Object.keys(game.guesses),
    deadline: game.deadline,
    reachedOpal: game.reachedOpal,
    standings: standings(game),
    winner: game.winner,
    amPlayer: game.players.includes(username),
    answers: isAdmin ? Object.fromEntries(game.puzzles.map(p => [p.number, p.answer])) : null,
    log: game.log,
  }
}
