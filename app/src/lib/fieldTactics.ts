import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Field Tactics: two hidden armies on a six by eight field split by a river.
// Walk a leader into the enemy base, or take everything that can move.

const PATH = join(process.cwd(), 'fieldtactics.json')

export const COLS = 6                  // A to F
export const ROWS = 8                  // 1 to 8
export const TURN_MS = 180_000
export const RESERVE_MS = 300_000

export type Side = 'red' | 'blue'
export type PieceKind =
  | 'G3' | 'G2' | 'G1'
  | 'F3' | 'F2' | 'F1'
  | 'C3' | 'C2' | 'C1'
  | 'plane' | 'tank' | 'cavalry' | 'engineer' | 'spy' | 'mine' | 'flag'

export const PIECE_NAMES: Record<PieceKind, string> = {
  G3: 'Генерал ***', G2: 'Генерал **', G1: 'Генерал *',
  F3: 'Офицер //...', F2: 'Офицер //..', F1: 'Офицер //.',
  C3: 'Ротный ^^^', C2: 'Ротный ^^', C1: 'Ротный ^',
  plane: 'Самолёт', tank: 'Танк', cavalry: 'Конница',
  engineer: 'Инженер', spy: 'Шпион', mine: 'Мина', flag: 'Флаг',
}

/** How many of each piece an army starts with, straight off the reference table. */
export const ARMY: Record<PieceKind, number> = {
  G3: 1, G2: 1, G1: 1,
  F3: 1, F2: 1, F1: 1,
  C3: 2, C2: 2, C1: 2,
  plane: 2, tank: 2, cavalry: 1, engineer: 2, spy: 1, mine: 2, flag: 1,
}

/** The six pieces that win the match by walking into the enemy base. */
export const LEADERS: PieceKind[] = ['G3', 'G2', 'G1', 'F3', 'F2', 'F1']
export const IMMOBILE: PieceKind[] = ['mine', 'flag']

/**
 * The pecking order read off the strength grid. Everything above beats
 * everything below it, and the exceptions are handled separately.
 */
const ORDER: PieceKind[] = [
  'G3', 'G2', 'G1', 'plane', 'tank', 'F3', 'F2', 'F1',
  'C3', 'C2', 'C1', 'cavalry', 'engineer', 'spy',
]

export type Outcome = 'attacker' | 'defender' | 'both'

/**
 * Who survives when one piece walks into another. A mine takes its attacker
 * with it unless a plane or an engineer defuses it, and the spy only ever wins
 * against the three star general.
 */
export function battle(attacker: PieceKind, defender: PieceKind, flagStrength?: PieceKind | null): Outcome {
  if (defender === 'flag') {
    // the flag borrows the strength of whatever stands behind it
    if (!flagStrength) return 'attacker'
    return battle(attacker, flagStrength)
  }
  if (defender === 'mine') {
    return attacker === 'plane' || attacker === 'engineer' ? 'attacker' : 'both'
  }
  if (attacker === 'spy') return defender === 'G3' ? 'attacker' : 'defender'
  if (defender === 'spy') return attacker === 'G3' ? 'defender' : 'attacker'
  if (attacker === defender) return 'both'

  const left = ORDER.indexOf(attacker)
  const right = ORDER.indexOf(defender)
  if (left < 0 || right < 0) return 'both'
  return left < right ? 'attacker' : 'defender'
}

export interface Piece {
  id: string
  side: Side
  kind: PieceKind
  square: number
  /** revealed to everyone once it has been in a battle */
  revealed: boolean
  alive: boolean
}

export type FtPhase = 'setup' | 'placing' | 'live' | 'tiebreak' | 'finished'

export interface FtLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'battle' | 'end'
}

export interface FieldTacticsGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  sides: Record<string, Side>
  phase: FtPhase
  pieces: Piece[]
  /** each player's opening layout, kept private until both are in */
  placed: Record<string, boolean>
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  /** the duel that settles a stalemate */
  tiebreakPicks: Record<string, string>
  winner: string | null
  log: FtLogEntry[]
  createdAt: string
}

// ---------- the board ----------

export const squareName = (index: number): string =>
  `${String.fromCharCode(65 + (index % COLS))}${Math.floor(index / COLS) + 1}`

export const colOf = (index: number): number => index % COLS
export const rowOf = (index: number): number => Math.floor(index / COLS)

/** Red sits on rows one to four and marches up the board. */
export const forwardOf = (side: Side): number => (side === 'red' ? 1 : -1)
export const homeRows = (side: Side): number[] => (side === 'red' ? [0, 1, 2, 3] : [4, 5, 6, 7])
export const baseOf = (side: Side): number[] =>
  side === 'red' ? [2, 3] : [(ROWS - 1) * COLS + 2, (ROWS - 1) * COLS + 3]

/** The river runs between rows four and five, with a bridge at B and at E. */
export const BRIDGE_COLUMNS = [1, 4]
export const BRIDGE_SQUARES = [
  3 * COLS + 1, 3 * COLS + 4, 4 * COLS + 1, 4 * COLS + 4,
]

function crossesRiver(from: number, to: number): boolean {
  const a = rowOf(from)
  const b = rowOf(to)
  return (a <= 3 && b >= 4) || (a >= 4 && b <= 3)
}

function bridged(from: number, to: number): boolean {
  return colOf(from) === colOf(to) && BRIDGE_COLUMNS.includes(colOf(from))
}

// ---------- storage ----------

function readAll(): Record<string, FieldTacticsGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, FieldTacticsGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): FieldTacticsGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: FieldTacticsGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): FieldTacticsGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: FieldTacticsGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null, sides: {},
    phase: 'setup',
    pieces: [],
    placed: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    tiebreakPicks: {},
    winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: FieldTacticsGame): FieldTacticsGame {
  return {
    ...game,
    phase: 'setup', pieces: [], placed: {}, sides: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    tiebreakPicks: {}, winner: null, log: [],
  }
}

function log(game: FieldTacticsGame, kind: FtLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: FieldTacticsGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: FieldTacticsGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function sideOf(game: FieldTacticsGame, player: string): Side {
  return game.sides[player] ?? 'red'
}

export function playerOfSide(game: FieldTacticsGame, side: Side): string {
  return duelists(game).find(p => game.sides[p] === side) ?? ''
}

export function pieceAt(game: FieldTacticsGame, square: number): Piece | null {
  return game.pieces.find(p => p.alive && p.square === square) ?? null
}

export function livePieces(game: FieldTacticsGame, side: Side): Piece[] {
  return game.pieces.filter(p => p.alive && p.side === side)
}

export function movablePieces(game: FieldTacticsGame, side: Side): Piece[] {
  return livePieces(game, side).filter(p => !IMMOBILE.includes(p.kind))
}

export function hasLeaders(game: FieldTacticsGame, side: Side): boolean {
  return livePieces(game, side).some(p => LEADERS.includes(p.kind))
}

// ---------- moving ----------

/** Every square this piece may legally reach right now. */
export function movesFor(game: FieldTacticsGame, piece: Piece): number[] {
  if (IMMOBILE.includes(piece.kind)) return []
  const from = piece.square
  const col = colOf(from)
  const row = rowOf(from)
  const forward = forwardOf(piece.side)
  const moves: number[] = []

  const own = (square: number): boolean => pieceAt(game, square)?.side === piece.side
  const empty = (square: number): boolean => !pieceAt(game, square)
  const push = (square: number): void => {
    if (square < 0 || square >= COLS * ROWS) return
    if (own(square)) return
    moves.push(square)
  }
  const step = (dc: number, dr: number): number | null => {
    const c = col + dc
    const r = row + dr
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null
    const target = r * COLS + c
    // the river only opens at the two bridges
    if (crossesRiver(from, target) && !bridged(from, target) && piece.kind !== 'plane') return null
    return target
  }

  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    const target = step(dc, dr)
    if (target != null) push(target)
  }

  if (piece.kind === 'tank' || piece.kind === 'cavalry') {
    // one extra square straight at the enemy base, if the path is clear
    const first = step(0, forward)
    if (first != null && empty(first)) {
      const c = col
      const r = row + forward * 2
      if (r >= 0 && r < ROWS) {
        const target = r * COLS + c
        const legs = [first, target]
        const blocked = legs.some(square =>
          crossesRiver(square === first ? from : first, square) &&
          !bridged(square === first ? from : first, square))
        if (!blocked) push(target)
      }
    }
  }

  if (piece.kind === 'plane') {
    // straight down the column over anything, river included
    for (const dr of [1, -1]) {
      for (let r = row + dr; r >= 0 && r < ROWS; r += dr) {
        push(r * COLS + col)
      }
    }
  }

  if (piece.kind === 'engineer') {
    // along the row until something stands in the way
    for (const dc of [1, -1]) {
      for (let c = col + dc; c >= 0 && c < COLS; c += dc) {
        const target = row * COLS + c
        push(target)
        if (!empty(target)) break
      }
    }
  }

  return [...new Set(moves)]
}

/** What the flag borrows: the piece directly behind it, towards its own base. */
export function flagBacking(game: FieldTacticsGame, flag: Piece): PieceKind | null {
  const behindRow = rowOf(flag.square) - forwardOf(flag.side)
  if (behindRow < 0 || behindRow >= ROWS) return null
  const behind = pieceAt(game, behindRow * COLS + colOf(flag.square))
  return behind && behind.side === flag.side ? behind.kind : null
}

function finish(game: FieldTacticsGame, winner: string, reason: string): FieldTacticsGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

function chargeReserve(game: FieldTacticsGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: FieldTacticsGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

export function applyClock(game: FieldTacticsGame, now = Date.now()): FieldTacticsGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

/** Both armies are down to scraps with no leaders left, so it goes to a duel. */
function stalemate(game: FieldTacticsGame): boolean {
  return duelists(game).every(player => {
    const side = sideOf(game, player)
    return !hasLeaders(game, side) && movablePieces(game, side).length <= 3
  })
}

export function move(game: FieldTacticsGame, player: string, from: number, to: number): FieldTacticsGame {
  chargeReserve(game, Date.now())
  const piece = pieceAt(game, from)
  if (!piece) return game
  const side = piece.side
  const target = pieceAt(game, to)

  if (target) {
    const backing = target.kind === 'flag' ? flagBacking(game, target) : null
    const result = battle(piece.kind, target.kind, backing)
    piece.revealed = true
    target.revealed = true
    const names = `${PIECE_NAMES[piece.kind]} против ${PIECE_NAMES[target.kind]}`

    if (result === 'attacker') {
      target.alive = false
      piece.square = to
      log(game, 'battle', `${squareName(from)} на ${squareName(to)}: ${names}, побеждает нападающий.`)
    } else if (result === 'defender') {
      piece.alive = false
      log(game, 'battle', `${squareName(from)} на ${squareName(to)}: ${names}, побеждает защитник.`)
    } else {
      piece.alive = false
      target.alive = false
      log(game, 'battle', `${squareName(from)} на ${squareName(to)}: ${names}, обе фигуры уничтожены.`)
    }
  } else {
    piece.square = to
    log(game, 'move', `${squareName(from)} на ${squareName(to)}.`)
  }

  // a leader standing in the enemy base ends it at once
  const enemyBase = baseOf(side === 'red' ? 'blue' : 'red')
  if (piece.alive && LEADERS.includes(piece.kind) && enemyBase.includes(piece.square)) {
    return finish(game, player, 'лидер занял базу соперника')
  }

  const rival = other(game, player)
  const rivalSide = sideOf(game, rival)
  if (movablePieces(game, rivalSide).length === 0) {
    return finish(game, player, 'у соперника не осталось подвижных фигур')
  }
  if (movablePieces(game, side).length === 0) {
    return finish(game, rival, 'подвижные фигуры кончились')
  }
  if (stalemate(game)) {
    game.phase = 'tiebreak'
    game.tiebreakPicks = {}
    game.turn = null
    log(game, 'end', 'Лидеров нет и фигур почти не осталось: начинается дуэль на выбывание.')
    return game
  }

  game.turn = rival
  game.turnStartedAt = new Date().toISOString()
  return game
}

/** The stalemate duel: both name a piece, they fight, and ties repeat. */
export function tiebreakPick(
  game: FieldTacticsGame, player: string, pieceId: string, advantage: string | null,
): FieldTacticsGame {
  game.tiebreakPicks = { ...game.tiebreakPicks, [player]: pieceId }
  if (duelists(game).some(p => !game.tiebreakPicks[p])) return game

  const [a, b] = duelists(game)
  const left = game.pieces.find(p => p.id === game.tiebreakPicks[a])
  const right = game.pieces.find(p => p.id === game.tiebreakPicks[b])
  game.tiebreakPicks = {}
  if (!left || !right) return game

  left.revealed = true
  right.revealed = true
  const result = battle(left.kind, right.kind)
  log(game, 'battle', `Дуэль: ${PIECE_NAMES[left.kind]} против ${PIECE_NAMES[right.kind]}.`)

  if (result === 'attacker') return finish(game, a, 'дуэль выиграна')
  if (result === 'defender') return finish(game, b, 'дуэль выиграна')

  left.alive = false
  right.alive = false
  const anyLeft = duelists(game).some(p => movablePieces(game, sideOf(game, p)).length > 0)
  if (!anyLeft) {
    return finish(game, advantage ?? b, 'все дуэли закончились вничью, решает преимущество')
  }
  return game
}

// ---------- setting up ----------

export function armyFor(side: Side): { kind: PieceKind; id: string }[] {
  const pieces: { kind: PieceKind; id: string }[] = []
  for (const kind of Object.keys(ARMY) as PieceKind[]) {
    for (let i = 0; i < ARMY[kind]; i++) pieces.push({ kind, id: `${side}-${kind}-${i}` })
  }
  return pieces
}

export function totalPieces(): number {
  return Object.values(ARMY).reduce((sum, count) => sum + count, 0)
}

/** Checks a whole opening layout before it is accepted. */
export function validateLayout(side: Side, layout: Record<string, number>): string | null {
  const army = armyFor(side)
  const ids = army.map(p => p.id)
  const given = Object.keys(layout)
  if (given.length !== ids.length) return `Нужно расставить все ${ids.length} фигур`
  if (!given.every(id => ids.includes(id))) return 'В расстановке есть чужая фигура'

  const squares = Object.values(layout)
  if (new Set(squares).size !== squares.length) return 'Две фигуры на одной клетке'

  const rows = homeRows(side)
  for (const [id, square] of Object.entries(layout)) {
    if (!rows.includes(rowOf(square))) return 'Фигуры ставятся только на своей половине'
    const kind = army.find(p => p.id === id)!.kind
    if (IMMOBILE.includes(kind) && BRIDGE_SQUARES.includes(square)) {
      return 'Мины и флаг нельзя ставить у входа на мост'
    }
  }
  for (const square of baseOf(side)) {
    if (!squares.includes(square)) return 'Обе клетки вашей базы должны быть заняты'
  }
  return null
}

export function placeArmy(
  game: FieldTacticsGame, player: string, layout: Record<string, number>,
): FieldTacticsGame {
  const side = sideOf(game, player)
  game.pieces = [
    ...game.pieces.filter(p => p.side !== side),
    ...armyFor(side).map(({ id, kind }) => ({
      id, side, kind, square: layout[id], revealed: false, alive: true,
    })),
  ]
  game.placed = { ...game.placed, [player]: true }
  log(game, 'setup', `${player} расставил армию.`)
  return game
}

export function startGame(game: FieldTacticsGame, first: string): FieldTacticsGame {
  game.phase = 'live'
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  log(game, 'setup', `Игра началась, первым ходит ${first}.`)
  return game
}

// ---------- what a viewer sees ----------

export interface FtSquareView {
  square: number
  side: Side | null
  /** the kind only when the viewer is allowed to know it */
  kind: PieceKind | null
  revealed: boolean
  id: string | null
}

export interface FtView {
  id: string
  name: string
  phase: FtPhase
  ec: string | null
  opponent: string | null
  mySide: Side | null
  board: FtSquareView[]
  myPieces: { id: string; kind: PieceKind; square: number; alive: boolean }[]
  moves: Record<string, number[]>
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  counts: Record<Side, { movable: number; leaders: number }>
  placed: Record<string, boolean>
  tiebreakWaiting: boolean
  winner: string | null
  isDuelist: boolean
  log: FtLogEntry[]
}

export function viewFor(game: FieldTacticsGame, username: string): FtView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)
  const mySide = isDuelist ? sideOf(game, username) : null
  const over = game.phase === 'finished'

  const board: FtSquareView[] = Array.from({ length: COLS * ROWS }, (_, square) => {
    const piece = pieceAt(game, square)
    if (!piece) return { square, side: null, kind: null, revealed: false, id: null }
    const open = over || piece.revealed || piece.side === mySide
    return {
      square,
      side: piece.side,
      kind: open ? piece.kind : null,
      revealed: piece.revealed,
      id: piece.side === mySide ? piece.id : null,
    }
  })

  const mine = isDuelist ? game.pieces.filter(p => p.side === mySide) : []
  const moves: Record<string, number[]> = {}
  if (isDuelist && game.phase === 'live' && game.turn === username) {
    for (const piece of mine.filter(p => p.alive)) {
      const list = movesFor(game, piece)
      if (list.length > 0) moves[piece.id] = list
    }
  }

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    mySide,
    board,
    myPieces: mine.map(p => ({ id: p.id, kind: p.kind, square: p.square, alive: p.alive })),
    moves,
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    counts: {
      red: { movable: movablePieces(game, 'red').length, leaders: livePieces(game, 'red').filter(p => LEADERS.includes(p.kind)).length },
      blue: { movable: movablePieces(game, 'blue').length, leaders: livePieces(game, 'blue').filter(p => LEADERS.includes(p.kind)).length },
    },
    placed: game.placed,
    tiebreakWaiting: game.phase === 'tiebreak' && isDuelist && !game.tiebreakPicks[username],
    winner: game.winner,
    isDuelist,
    log: game.log,
  }
}
