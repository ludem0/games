import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Swapping Black and White: a two player deathmatch where nine tiles are laid
// out face down, then swapped and revealed one at a time.

const PATH = join(process.cwd(), 'swapping.json')

export const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8]
export const PLAY_MS = 180_000      // three minutes for a play phase trio
export const SWAP_MS = 120_000      // two minutes for a swap or a reveal
export const RESERVE_MS = 300_000   // five minutes per player, refilled every game
export const MAX_GAMES = 3

export type SwPhase = 'setup' | 'play' | 'swap' | 'finished'
/** inside the swap phase the two steps alternate */
export type SwapStep = 'swap' | 'reveal'

export const isBlack = (tile: number): boolean => tile % 2 === 0

export interface SwRound {
  number: number
  /** which trio of positions is being laid out: 0, 1, 2, then 3 once the board is full */
  playStep: number
  /** the tile sitting at each of the nine positions, per player */
  board: Record<string, (number | null)[]>
  /** points from the play phase, announced but not decisive */
  playPoints: Record<string, number>
  swapStep: SwapStep
  revealed: Record<string, boolean[]>
  /** what each player has handed in for the current step, null while they think */
  submitted: Record<string, number[] | null>
  points: Record<string, number>
  winner: string | null
  finishedAt: string | null
}

export interface SwLogEntry {
  at: string
  text: string
  kind: 'setup' | 'play' | 'swap' | 'reveal' | 'game' | 'end'
}

export interface SwappingGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  phase: SwPhase
  rounds: SwRound[]
  /** when the current step opened, the base allowance runs from here */
  stepStartedAt: string | null
  reserveMs: Record<string, number>
  log: SwLogEntry[]
  winner: string | null
  createdAt: string
}

function readAll(): Record<string, SwappingGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, SwappingGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): SwappingGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: SwappingGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): SwappingGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: SwappingGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    rounds: [],
    stepStartedAt: null, reserveMs: {},
    log: [], winner: null,
    createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: SwappingGame): SwappingGame {
  return {
    ...game,
    phase: 'setup', rounds: [], stepStartedAt: null, reserveMs: {},
    log: [], winner: null,
  }
}

// ---------- helpers ----------

export function duelists(game: SwappingGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: SwappingGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function currentRound(game: SwappingGame): SwRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

function log(game: SwappingGame, kind: SwLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

/** Tiles a player has not put on the board yet. */
export function tilesInHand(round: SwRound, player: string): number[] {
  const placed = new Set((round.board[player] ?? []).filter((t): t is number => t != null))
  return TILES.filter(t => !placed.has(t))
}

/** Positions holding a tile that is still face down. */
export function hiddenPositions(round: SwRound, player: string): number[] {
  return (round.revealed[player] ?? []).flatMap((seen, i) => (seen ? [] : [i]))
}

/** A player must swap while they still hold both colours face down. */
export function canSwap(round: SwRound, player: string): boolean {
  const hidden = hiddenPositions(round, player).map(i => round.board[player]?.[i])
  return hidden.some(t => t != null && isBlack(t)) && hidden.some(t => t != null && !isBlack(t))
}

function scoreBoards(game: SwappingGame, round: SwRound, from: number, to: number): Record<string, number> {
  const [a, b] = duelists(game)
  const points: Record<string, number> = { [a]: 0, [b]: 0 }
  for (let i = from; i < to; i++) {
    const left = round.board[a]?.[i]
    const right = round.board[b]?.[i]
    if (left == null || right == null || left === right) continue
    points[left > right ? a : b] += 1
  }
  return points
}

// ---------- lifecycle ----------

function openStep(game: SwappingGame): void {
  const round = currentRound(game)
  if (!round) return
  round.submitted = Object.fromEntries(duelists(game).map(p => [p, null]))
  game.stepStartedAt = new Date().toISOString()

  // a player down to one colour has nothing to swap, so they pass without waiting
  if (game.phase !== 'swap' || round.swapStep !== 'swap') return
  for (const p of duelists(game)) {
    if (!canSwap(round, p)) round.submitted = { ...round.submitted, [p]: [] }
  }
  if (duelists(game).every(p => round.submitted[p] != null)) {
    applySwaps(game, round)
    openStep(game)
  }
}

export function startRound(game: SwappingGame): SwappingGame {
  const number = game.rounds.length + 1
  const players = duelists(game)
  game.rounds = [...game.rounds, {
    number,
    playStep: 0,
    board: Object.fromEntries(players.map(p => [p, Array(9).fill(null)])),
    playPoints: Object.fromEntries(players.map(p => [p, 0])),
    swapStep: 'swap',
    revealed: Object.fromEntries(players.map(p => [p, Array(9).fill(false)])),
    submitted: Object.fromEntries(players.map(p => [p, null])),
    points: Object.fromEntries(players.map(p => [p, 0])),
    winner: null,
    finishedAt: null,
  }]
  game.phase = 'play'
  // the reserve is handed out fresh for every game
  game.reserveMs = Object.fromEntries(players.map(p => [p, RESERVE_MS]))
  openStep(game)
  log(game, 'game', `Игра ${number} началась. Фаза выкладки, позиции 1-3.`)
  return game
}

function finish(game: SwappingGame, winner: string, reason: string): SwappingGame {
  game.phase = 'finished'
  game.winner = winner
  game.stepStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

/** A game that ended level: replay, unless this was the third one. */
function endTied(game: SwappingGame, round: SwRound): SwappingGame {
  round.finishedAt = new Date().toISOString()
  game.stepStartedAt = null
  log(game, 'game', `Игра ${round.number} закончилась вничью.`)
  if (game.rounds.length >= MAX_GAMES) {
    return finish(game, game.opponent ?? '', 'три ничьих подряд, победа за оппонентом')
  }
  return game
}

function endRound(game: SwappingGame, round: SwRound): SwappingGame {
  const [a, b] = duelists(game)
  round.points = scoreBoards(game, round, 0, 9)
  round.finishedAt = new Date().toISOString()
  log(game, 'game', `Итог игры ${round.number}: ${a} ${round.points[a]} : ${round.points[b]} ${b}`)
  if (round.points[a] === round.points[b]) return endTied(game, round)
  const winner = round.points[a] > round.points[b] ? a : b
  round.winner = winner
  return finish(game, winner, `больше очков в игре ${round.number}`)
}

// ---------- clock ----------

/** Everyone who still owes the current step an answer. */
function pendingPlayers(game: SwappingGame): string[] {
  const round = currentRound(game)
  if (!round || round.finishedAt || game.phase === 'setup' || game.phase === 'finished') return []
  return duelists(game).filter(p => round.submitted[p] == null)
}

function baseMs(game: SwappingGame): number {
  return game.phase === 'play' ? PLAY_MS : SWAP_MS
}

export function deadlineFor(game: SwappingGame, player: string): number | null {
  if (!game.stepStartedAt || !pendingPlayers(game).includes(player)) return null
  return new Date(game.stepStartedAt).getTime() + baseMs(game) + (game.reserveMs[player] ?? 0)
}

/** Charge whatever ran past the base allowance to that player's reserve. */
function chargeReserve(game: SwappingGame, player: string, now: number): void {
  if (!game.stepStartedAt) return
  const over = now - (new Date(game.stepStartedAt).getTime() + baseMs(game))
  if (over <= 0) return
  game.reserveMs = { ...game.reserveMs, [player]: Math.max(0, (game.reserveMs[player] ?? 0) - over) }
}

/**
 * Settled on every read. Running out of reserve loses the deathmatch; if both
 * players sat it out, the elimination candidate is the one who goes.
 */
export function applyClock(game: SwappingGame, now = Date.now()): SwappingGame {
  const late = pendingPlayers(game)
    .map(player => ({ player, deadline: deadlineFor(game, player) ?? Infinity }))
    .filter(x => now >= x.deadline)
    .sort((a, b) => a.deadline - b.deadline)
  if (late.length === 0) return game

  const loser = late.length > 1 && late[0].deadline === late[1].deadline
    ? (game.ec ?? late[0].player)
    : late[0].player
  game.reserveMs = { ...game.reserveMs, [loser]: 0 }
  return finish(game, other(game, loser), `у ${loser} кончилось время`)
}

// ---------- the play phase ----------

export function submitPlay(game: SwappingGame, player: string, tiles: number[]): SwappingGame {
  const round = currentRound(game)
  if (!round) return game
  chargeReserve(game, player, Date.now())
  round.submitted = { ...round.submitted, [player]: tiles }

  if (duelists(game).some(p => round.submitted[p] == null)) return game

  // both are in: the trio goes on the board and the running score is announced
  const from = round.playStep * 3
  for (const p of duelists(game)) {
    const chosen = round.submitted[p] ?? []
    round.board = {
      ...round.board,
      [p]: (round.board[p] ?? []).map((t, i) => (i >= from && i < from + 3 ? chosen[i - from] : t)),
    }
  }
  const [a, b] = duelists(game)
  const gained = scoreBoards(game, round, from, from + 3)
  round.playPoints = {
    [a]: (round.playPoints[a] ?? 0) + gained[a],
    [b]: (round.playPoints[b] ?? 0) + gained[b],
  }
  log(game, 'play', `Позиции ${from + 1}-${from + 3} выложены. Счёт: ${a} ${round.playPoints[a]} : ${round.playPoints[b]} ${b}`)

  round.playStep += 1
  if (round.playStep >= 3) {
    game.phase = 'swap'
    round.swapStep = 'swap'
    log(game, 'play', 'Все девять плиток выложены. Фаза обмена.')
  }
  openStep(game)
  return game
}

// ---------- the swap phase ----------

function applySwaps(game: SwappingGame, round: SwRound): void {
  for (const p of duelists(game)) {
    const pair = round.submitted[p] ?? []
    if (pair.length !== 2) {
      log(game, 'swap', `${p} пропускает обмен: остался один цвет`)
      continue
    }
    const [i, j] = pair
    const row = [...(round.board[p] ?? [])]
    const swap = row[i]
    row[i] = row[j]
    row[j] = swap
    round.board = { ...round.board, [p]: row }
    log(game, 'swap', `${p} поменял местами две закрытые плитки`)
  }
  round.swapStep = 'reveal'
}

function applyReveals(game: SwappingGame, round: SwRound): void {
  for (const p of duelists(game)) {
    const [position] = round.submitted[p] ?? []
    if (position == null) continue
    round.revealed = {
      ...round.revealed,
      [p]: (round.revealed[p] ?? []).map((seen, i) => (i === position ? true : seen)),
    }
    log(game, 'reveal', `${p} открывает позицию ${position + 1}: ${round.board[p]?.[position]}`)
  }
  round.swapStep = 'swap'
}

export function submitSwap(game: SwappingGame, player: string, choice: number[]): SwappingGame {
  const round = currentRound(game)
  if (!round) return game
  chargeReserve(game, player, Date.now())
  round.submitted = { ...round.submitted, [player]: choice }

  if (duelists(game).some(p => round.submitted[p] == null)) return game

  if (round.swapStep === 'swap') {
    applySwaps(game, round)
    openStep(game)
    return game
  }

  applyReveals(game, round)
  const allSeen = duelists(game).every(p => (round.revealed[p] ?? []).every(Boolean))
  if (allSeen) return endRound(game, round)
  openStep(game)
  return game
}

// ---------- what a viewer sees ----------

export interface SwSeat {
  player: string
  /** own tiles in full; anyone else's only where they have been revealed */
  tiles: (number | null)[]
  revealed: boolean[]
  isMe: boolean
  submitted: boolean
}

export interface SwView {
  id: string
  name: string
  phase: SwPhase
  ec: string | null
  opponent: string | null
  round: number
  playStep: number
  swapStep: SwapStep
  seats: SwSeat[]
  myHand: number[]
  playPoints: Record<string, number>
  points: Record<string, number>
  /** true once this player has handed in the current step */
  iSubmitted: boolean
  rivalSubmitted: boolean
  mustSwap: boolean
  deadline: number | null
  reserveMs: Record<string, number>
  results: { number: number; winner: string | null; points: Record<string, number> }[]
  awaitingNextGame: boolean
  winner: string | null
  log: SwLogEntry[]
  isDuelist: boolean
}

export function viewFor(game: SwappingGame, username: string): SwView {
  const round = currentRound(game)
  const isDuelist = duelists(game).includes(username)
  const over = game.phase === 'finished'

  // someone else's tile stays face down until it is revealed, or the game ends
  const seats: SwSeat[] = round ? duelists(game).map(player => {
    const revealed = round.revealed[player] ?? Array(9).fill(false)
    const own = player === username
    return {
      player,
      tiles: (round.board[player] ?? []).map((t, i) => (own || over || revealed[i] ? t : null)),
      revealed,
      isMe: own,
      submitted: round.submitted[player] != null,
    }
  }) : []

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    round: round?.number ?? 0,
    playStep: round?.playStep ?? 0,
    swapStep: round?.swapStep ?? 'swap',
    seats,
    myHand: isDuelist && round ? tilesInHand(round, username) : [],
    playPoints: round?.playPoints ?? {},
    points: round?.points ?? {},
    iSubmitted: !!round && round.submitted[username] != null,
    rivalSubmitted: !!round && isDuelist && round.submitted[other(game, username)] != null,
    mustSwap: !!round && isDuelist && canSwap(round, username),
    deadline: isDuelist ? deadlineFor(game, username) : null,
    reserveMs: game.reserveMs,
    results: game.rounds.map(r => ({ number: r.number, winner: r.winner, points: r.points })),
    awaitingNextGame:
      game.phase !== 'finished' && !!round?.finishedAt && game.rounds.length < MAX_GAMES,
    winner: game.winner,
    log: game.log,
    isDuelist,
  }
}
