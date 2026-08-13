import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Ultimate Tic Tac Toe: a two player deathmatch over a 9x9 board made of nine
// local boards. Storage mirrors the other games: one flat JSON file keyed by slug.

const PATH = join(process.cwd(), 'ultimate.json')

export const TURN_MS = 60_000         // base time for a move
export const RESERVE_MS = 180_000     // per player, refilled for every game
export const MAX_GAMES = 3
/** the centre of the centre board, the one square the opening move may not take */
export const CENTRE_CELL = 40

export type Mark = 'X' | 'O'
export type UtPhase = 'setup' | 'live' | 'finished'
/** a local board is won by a mark, drawn when it filled up, or still open */
export type LocalResult = Mark | 'draw' | null

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export interface UtMove {
  at: string
  player: string
  mark: Mark
  cell: number
}

export interface UtRound {
  number: number
  /** the player on X, who moves first in this game */
  starter: string
  cells: (Mark | null)[]
  boards: LocalResult[]
  /** where the next move must land, null when the player may go anywhere */
  activeBoard: number | null
  moves: UtMove[]
  /** the player who made three in a row on the global board, if anyone did */
  winner: string | null
  finishedAt: string | null
}

export interface UtLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'board' | 'game' | 'end'
}

export interface UltimateGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  /** the elimination candidate and the opponent they picked */
  ec: string | null
  opponent: string | null
  phase: UtPhase
  /** who plays X in game 1; the two swap for every following game */
  firstStarter: string | null
  rounds: UtRound[]
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  log: UtLogEntry[]
  winner: string | null
  createdAt: string
}

function readAll(): Record<string, UltimateGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, UltimateGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): UltimateGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: UltimateGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): UltimateGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: UltimateGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    firstStarter: null,
    rounds: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    log: [], winner: null,
    createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: UltimateGame): UltimateGame {
  return {
    ...game,
    phase: 'setup',
    firstStarter: null,
    rounds: [],
    turn: null, turnStartedAt: null, reserveMs: {},
    log: [], winner: null,
  }
}

// ---------- helpers ----------

export function duelists(game: UltimateGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: UltimateGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function currentRound(game: UltimateGame): UtRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

function log(game: UltimateGame, kind: UtLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

function lineWinner(slots: readonly (Mark | 'draw' | null)[]): Mark | null {
  for (const [a, b, c] of LINES) {
    const v = slots[a]
    if ((v === 'X' || v === 'O') && slots[b] === v && slots[c] === v) return v
  }
  return null
}

/** Local boards a player has taken, counted over every game played so far. */
export function boardsWon(game: UltimateGame): Record<string, number> {
  const tally: Record<string, number> = Object.fromEntries(duelists(game).map(p => [p, 0]))
  for (const round of game.rounds) {
    for (const result of round.boards) {
      if (result !== 'X' && result !== 'O') continue
      const owner = result === 'X' ? round.starter : other(game, round.starter)
      tally[owner] = (tally[owner] ?? 0) + 1
    }
  }
  return tally
}

export function markOf(round: UtRound, player: string): Mark {
  return player === round.starter ? 'X' : 'O'
}

/**
 * A local board takes no more pieces once it is won or full, so a move sent
 * there frees the player to play anywhere instead.
 */
function isClosed(round: UtRound, board: number): boolean {
  return round.boards[board] != null
}

export function legalCells(round: UtRound): number[] {
  const opening = round.moves.length === 0
  const cells: number[] = []
  for (let i = 0; i < 81; i++) {
    if (round.cells[i]) continue
    const board = Math.floor(i / 9)
    if (isClosed(round, board)) continue
    if (round.activeBoard != null && board !== round.activeBoard) continue
    if (opening && i === CENTRE_CELL) continue
    cells.push(i)
  }
  return cells
}

// ---------- lifecycle ----------

function starterFor(game: UltimateGame, roundNumber: number): string {
  const first = game.firstStarter ?? duelists(game)[0]
  // the two swap every game, so game 1 and game 3 share a starter
  return roundNumber % 2 === 1 ? first : other(game, first)
}

export function startRound(game: UltimateGame): UltimateGame {
  const number = game.rounds.length + 1
  const starter = starterFor(game, number)
  game.rounds = [...game.rounds, {
    number,
    starter,
    cells: Array(81).fill(null),
    boards: Array(9).fill(null),
    activeBoard: null,
    moves: [],
    winner: null,
    finishedAt: null,
  }]
  game.phase = 'live'
  game.turn = starter
  game.turnStartedAt = new Date().toISOString()
  // the reserve is handed out fresh for every game
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  log(game, 'game', `Игра ${number} началась. Первым ходит ${starter} (X).`)
  return game
}

function finish(game: UltimateGame, winner: string, reason: string): UltimateGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

/** After three games without a global line: most local boards, then the DMO. */
function resolveSeries(game: UltimateGame): UltimateGame {
  const tally = boardsWon(game)
  const ec = game.ec ?? ''
  const dmo = game.opponent ?? ''
  const ecBoards = tally[ec] ?? 0
  const dmoBoards = tally[dmo] ?? 0
  if (ecBoards === dmoBoards) {
    return finish(game, dmo, `три игры без линии, поровну локальных досок (${ecBoards}), победа за оппонентом`)
  }
  const winner = ecBoards > dmoBoards ? ec : dmo
  return finish(game, winner, `три игры без линии, больше локальных досок (${Math.max(ecBoards, dmoBoards)}:${Math.min(ecBoards, dmoBoards)})`)
}

/** A game ended with nobody making a global line. */
function endRoundDrawn(game: UltimateGame, round: UtRound): UltimateGame {
  round.finishedAt = new Date().toISOString()
  game.turn = null
  game.turnStartedAt = null
  log(game, 'game', `Игра ${round.number} закончилась без линии на глобальной доске.`)
  return game.rounds.length >= MAX_GAMES ? resolveSeries(game) : game
}

// ---------- clock ----------

export function deadlineOf(game: UltimateGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

/** Charge whatever ran past the base minute to the reserve. */
function chargeReserve(game: UltimateGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

/**
 * Settled on every read, so an abandoned turn still resolves: running out of
 * time loses the whole deathmatch, not just the game.
 */
export function applyClock(game: UltimateGame, now = Date.now()): UltimateGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  log(game, 'end', `${limit.player} исчерпал время`)
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

// ---------- the move ----------

export function play(game: UltimateGame, player: string, cell: number): UltimateGame {
  const round = currentRound(game)
  if (!round) return game
  chargeReserve(game, Date.now())

  const mark = markOf(round, player)
  const board = Math.floor(cell / 9)
  const pos = cell % 9

  round.cells = round.cells.map((v, i) => (i === cell ? mark : v))
  round.moves = [...round.moves, { at: new Date().toISOString(), player, mark, cell }]

  // did that finish the local board?
  const local = round.cells.slice(board * 9, board * 9 + 9)
  const localWinner = lineWinner(local)
  if (localWinner) {
    round.boards = round.boards.map((v, i) => (i === board ? localWinner : v))
    log(game, 'board', `${player} забрал доску ${board + 1} (${localWinner})`)
  } else if (local.every(v => v != null)) {
    round.boards = round.boards.map((v, i) => (i === board ? 'draw' : v))
    log(game, 'board', `Доска ${board + 1} заполнена без линии`)
  }

  // and did that finish the game?
  const globalWinner = lineWinner(round.boards)
  if (globalWinner) {
    round.winner = player
    round.finishedAt = new Date().toISOString()
    log(game, 'game', `${player} собрал три в ряд на глобальной доске в игре ${round.number}`)
    return finish(game, player, `линия на глобальной доске в игре ${round.number}`)
  }

  // a move sent into a closed board frees the opponent to play anywhere
  round.activeBoard = isClosed(round, pos) ? null : pos

  if (legalCells(round).length === 0) return endRoundDrawn(game, round)

  game.turn = other(game, player)
  game.turnStartedAt = new Date().toISOString()
  return game
}

// ---------- what a viewer sees ----------

export interface UtView {
  id: string
  name: string
  phase: UtPhase
  ec: string | null
  opponent: string | null
  firstStarter: string | null
  rounds: UtRound[]
  turn: string | null
  deadline: number | null
  deadlineFor: string | null
  reserveMs: Record<string, number>
  legalCells: number[]
  boardsWon: Record<string, number>
  /** a finished game with the series still running: the host starts the next one */
  awaitingNextGame: boolean
  winner: string | null
  log: UtLogEntry[]
  isDuelist: boolean
  myMark: Mark | null
}

export function viewFor(game: UltimateGame, username: string): UtView {
  const limit = deadlineOf(game)
  const round = currentRound(game)
  const isDuelist = duelists(game).includes(username)

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    firstStarter: game.firstStarter,
    rounds: game.rounds,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    deadlineFor: limit?.player ?? null,
    reserveMs: game.reserveMs,
    legalCells: round && !round.finishedAt ? legalCells(round) : [],
    boardsWon: boardsWon(game),
    awaitingNextGame:
      game.phase === 'live' && !!round?.finishedAt && game.rounds.length < MAX_GAMES,
    winner: game.winner,
    log: game.log,
    isDuelist,
    myMark: round && isDuelist ? markOf(round, username) : null,
  }
}
