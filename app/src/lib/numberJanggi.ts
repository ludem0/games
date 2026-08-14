import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Number Janggi: fourteen face down pieces a side, and arithmetic instead of
// brute force. A battle is won by whichever number the sum happens to favour.

const PATH = join(process.cwd(), 'numberjanggi.json')

export const COLS = 6
export const ROWS = 9
export const TURN_MS = 120_000
export const RESERVE_MS = 300_000
/** the red bars sit between these column pairs, and they flip a battle */
export const BARS: [number, number][] = [[1, 2], [3, 4]]

export type Side = 'red' | 'blue'
export type NjKind = 'soldier' | 'bomb' | 'king'
export type NjPhase = 'setup' | 'placing' | 'live' | 'finished'

export interface NjPiece {
  id: string
  side: Side
  kind: NjKind
  /** one to ten for soldiers, zero otherwise */
  value: number
  square: number
  revealed: boolean
  alive: boolean
}

export interface NjLogEntry {
  at: string
  text: string
  kind: 'setup' | 'move' | 'battle' | 'return' | 'end'
}

export interface NumberJanggiGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  sides: Record<string, Side>
  phase: NjPhase
  pieces: NjPiece[]
  placed: Record<string, boolean>
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  /** set when a soldier has just reached the far row and may call somebody back */
  reinforcing: string | null
  winner: string | null
  log: NjLogEntry[]
  createdAt: string
}

// ---------- the board ----------

export const squareName = (index: number): string =>
  `${String.fromCharCode(65 + (index % COLS))}${Math.floor(index / COLS) + 1}`

export const colOf = (index: number): number => index % COLS
export const rowOf = (index: number): number => Math.floor(index / COLS)

export const forwardOf = (side: Side): number => (side === 'red' ? 1 : -1)
export const homeRows = (side: Side): number[] => (side === 'red' ? [0, 1, 2] : [6, 7, 8])
export const backRow = (side: Side): number => (side === 'red' ? 0 : ROWS - 1)
/** the row a piece has to reach to earn a piece back, or to win with the king */
export const farRow = (side: Side): number => backRow(side === 'red' ? 'blue' : 'red')

/** Two squares sit across a bar when they are side by side over one of the lines. */
export function acrossBar(a: number, b: number): boolean {
  if (rowOf(a) !== rowOf(b)) return false
  const low = Math.min(colOf(a), colOf(b))
  const high = Math.max(colOf(a), colOf(b))
  return BARS.some(([left, right]) => left === low && right === high)
}

export function neighbours(square: number): number[] {
  const col = colOf(square)
  const row = rowOf(square)
  const out: number[] = []
  if (col > 0) out.push(square - 1)
  if (col < COLS - 1) out.push(square + 1)
  if (row > 0) out.push(square - COLS)
  if (row < ROWS - 1) out.push(square + COLS)
  return out
}

// ---------- battles ----------

export type BattleResult = { attackerLoses: boolean; defenderLoses: boolean }

/**
 * Who falls when two pieces meet. Soldiers add up, or subtract across a bar,
 * and ten is the line between the big number winning and the small one.
 */
export function battle(a: NjPiece, b: NjPiece, bar: boolean): BattleResult {
  if (a.kind === 'bomb' || b.kind === 'bomb') return { attackerLoses: true, defenderLoses: true }
  if (a.kind === 'king' && b.kind === 'king') return { attackerLoses: false, defenderLoses: false }
  if (a.kind === 'king') return { attackerLoses: true, defenderLoses: false }
  if (b.kind === 'king') return { attackerLoses: false, defenderLoses: true }
  if (a.value === b.value) return { attackerLoses: true, defenderLoses: true }

  const total = bar ? Math.abs(a.value - b.value) : a.value + b.value
  const higherWins = total >= 10
  const aIsHigher = a.value > b.value
  const aWins = higherWins ? aIsHigher : !aIsHigher
  return { attackerLoses: !aWins, defenderLoses: aWins }
}

// ---------- storage ----------

function readAll(): Record<string, NumberJanggiGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, NumberJanggiGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): NumberJanggiGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: NumberJanggiGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): NumberJanggiGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: NumberJanggiGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null, sides: {},
    phase: 'setup', pieces: [], placed: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    reinforcing: null, winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: NumberJanggiGame): NumberJanggiGame {
  return {
    ...game,
    phase: 'setup', pieces: [], placed: {}, sides: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    reinforcing: null, winner: null, log: [],
  }
}

function log(game: NumberJanggiGame, kind: NjLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: NumberJanggiGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: NumberJanggiGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function sideOf(game: NumberJanggiGame, player: string): Side {
  return game.sides[player] ?? 'red'
}

export function pieceAt(game: NumberJanggiGame, square: number): NjPiece | null {
  return game.pieces.find(p => p.alive && p.square === square) ?? null
}

export function livePieces(game: NumberJanggiGame, side: Side): NjPiece[] {
  return game.pieces.filter(p => p.alive && p.side === side)
}

/** An army with fourteen pieces: ten soldiers, three bombs and the king. */
export function armyFor(side: Side): { id: string; kind: NjKind; value: number }[] {
  const pieces: { id: string; kind: NjKind; value: number }[] = []
  for (let value = 1; value <= 10; value++) {
    pieces.push({ id: `${side}-s${value}`, kind: 'soldier', value })
  }
  for (let i = 0; i < 3; i++) pieces.push({ id: `${side}-bomb${i}`, kind: 'bomb', value: 0 })
  pieces.push({ id: `${side}-king`, kind: 'king', value: 0 })
  return pieces
}

// ---------- moving ----------

export function movesFor(game: NumberJanggiGame, piece: NjPiece): number[] {
  if (piece.kind === 'bomb') return []
  const col = colOf(piece.square)
  const row = rowOf(piece.square)
  const forward = forwardOf(piece.side)
  const moves: number[] = []

  const free = (c: number, r: number): boolean =>
    c >= 0 && c < COLS && r >= 0 && r < ROWS && !pieceAt(game, r * COLS + c)

  // sideways
  for (const dc of [-1, 1]) if (free(col + dc, row)) moves.push(row * COLS + col + dc)
  // diagonally forward
  for (const dc of [-1, 1]) if (free(col + dc, row + forward)) moves.push((row + forward) * COLS + col + dc)
  // one or two straight ahead, and the two step cannot jump
  if (free(col, row + forward)) {
    moves.push((row + forward) * COLS + col)
    if (free(col, row + forward * 2)) moves.push((row + forward * 2) * COLS + col)
  }
  return moves
}

function finish(game: NumberJanggiGame, winner: string, reason: string): NumberJanggiGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.turnStartedAt = null
  game.reinforcing = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

/** Everything adjacent fights at once, and a piece that loses anywhere falls. */
function resolveBattles(game: NumberJanggiGame): void {
  const doomed = new Set<string>()
  const seen = new Set<string>()

  for (const piece of game.pieces.filter(p => p.alive)) {
    for (const square of neighbours(piece.square)) {
      const foe = pieceAt(game, square)
      if (!foe || foe.side === piece.side) continue
      const key = [piece.id, foe.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const bar = acrossBar(piece.square, foe.square)
      const result = battle(piece, foe, bar)
      piece.revealed = true
      foe.revealed = true
      if (result.attackerLoses) doomed.add(piece.id)
      if (result.defenderLoses) doomed.add(foe.id)
      log(game, 'battle',
        `${squareName(piece.square)} против ${squareName(foe.square)}${bar ? ' через полосу' : ''}: ` +
        `${describe(piece)} и ${describe(foe)}, падает ${
          [result.attackerLoses ? describe(piece) : '', result.defenderLoses ? describe(foe) : '']
            .filter(Boolean).join(' и ') || 'никто'}.`)
    }
  }
  for (const piece of game.pieces) if (doomed.has(piece.id)) piece.alive = false
}

function describe(piece: NjPiece): string {
  if (piece.kind === 'king') return 'король'
  if (piece.kind === 'bomb') return 'мина'
  return `${piece.value}`
}

function checkVictory(game: NumberJanggiGame, mover: string): NumberJanggiGame | null {
  const side = sideOf(game, mover)
  const rivalSide = side === 'red' ? 'blue' : 'red'
  const rival = other(game, mover)

  const kingGone = (target: Side): boolean => !livePieces(game, target).some(p => p.kind === 'king')
  if (kingGone(rivalSide)) return finish(game, mover, 'король соперника снят с доски')
  if (kingGone(side)) return finish(game, rival, 'король снят с доски')

  const bare = (target: Side): boolean => livePieces(game, target).every(p => p.kind === 'king')
  if (bare(rivalSide)) return finish(game, mover, 'у соперника остался только король')
  if (bare(side)) return finish(game, rival, 'остался только король')

  const king = livePieces(game, side).find(p => p.kind === 'king')
  if (king && rowOf(king.square) === farRow(side)) {
    return finish(game, mover, 'король дошёл до задней линии соперника')
  }
  return null
}

function chargeReserve(game: NumberJanggiGame, now: number): void {
  if (!game.turn || !game.turnStartedAt) return
  const over = now - (new Date(game.turnStartedAt).getTime() + TURN_MS)
  if (over <= 0) return
  const left = game.reserveMs[game.turn] ?? 0
  game.reserveMs = { ...game.reserveMs, [game.turn]: Math.max(0, left - over) }
}

export function deadlineOf(game: NumberJanggiGame): { player: string; deadline: number } | null {
  if (game.phase !== 'live' || !game.turn || !game.turnStartedAt) return null
  const reserve = game.reserveMs[game.turn] ?? 0
  return { player: game.turn, deadline: new Date(game.turnStartedAt).getTime() + TURN_MS + reserve }
}

export function applyClock(game: NumberJanggiGame, now = Date.now()): NumberJanggiGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game
  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }
  return finish(game, other(game, limit.player), `у ${limit.player} кончилось время`)
}

export function move(game: NumberJanggiGame, player: string, from: number, to: number): NumberJanggiGame {
  chargeReserve(game, Date.now())
  const piece = pieceAt(game, from)
  if (!piece) return game
  const side = piece.side

  piece.square = to
  log(game, 'move', `${squareName(from)} на ${squareName(to)}.`)
  resolveBattles(game)

  const decided = checkVictory(game, player)
  if (decided) return decided

  // a soldier standing on the far row calls somebody back
  const arrived = piece.alive && piece.kind === 'soldier' && rowOf(piece.square) === farRow(side)
  const fallen = game.pieces.some(p => !p.alive && p.side === side && p.kind === 'soldier')
  const room = Array.from({ length: COLS }, (_, col) => backRow(side) * COLS + col)
    .some(square => !pieceAt(game, square))

  if (arrived && fallen && room) {
    game.reinforcing = player
    log(game, 'return', `${player} может вернуть в игру одну свою павшую фигуру.`)
    return game
  }

  game.turn = other(game, player)
  game.turnStartedAt = new Date().toISOString()
  return game
}

export function reinforce(
  game: NumberJanggiGame, player: string, pieceId: string, square: number,
): NumberJanggiGame {
  const piece = game.pieces.find(p => p.id === pieceId)
  if (!piece || piece.alive) return game
  piece.alive = true
  piece.square = square
  piece.revealed = true
  game.reinforcing = null
  log(game, 'return', `${player} возвращает ${describe(piece)} на ${squareName(square)}.`)

  resolveBattles(game)
  const decided = checkVictory(game, player)
  if (decided) return decided

  game.turn = other(game, player)
  game.turnStartedAt = new Date().toISOString()
  return game
}

export function skipReinforcement(game: NumberJanggiGame, player: string): NumberJanggiGame {
  game.reinforcing = null
  game.turn = other(game, player)
  game.turnStartedAt = new Date().toISOString()
  return game
}

// ---------- setting up ----------

export function validateLayout(side: Side, layout: Record<string, number>): string | null {
  const army = armyFor(side)
  const ids = army.map(p => p.id)
  const given = Object.keys(layout)
  if (given.length !== ids.length) return `Нужно расставить все ${ids.length} фигур`
  if (!given.every(id => ids.includes(id))) return 'В расстановке есть чужая фигура'
  const squares = Object.values(layout)
  if (new Set(squares).size !== squares.length) return 'Две фигуры на одной клетке'
  if (!squares.every(square => homeRows(side).includes(rowOf(square)))) {
    return 'Фигуры ставятся только на своей территории'
  }
  return null
}

export function placeArmy(
  game: NumberJanggiGame, player: string, layout: Record<string, number>,
): NumberJanggiGame {
  const side = sideOf(game, player)
  game.pieces = [
    ...game.pieces.filter(p => p.side !== side),
    ...armyFor(side).map(({ id, kind, value }) => ({
      id, side, kind, value, square: layout[id], revealed: false, alive: true,
    })),
  ]
  game.placed = { ...game.placed, [player]: true }
  log(game, 'setup', `${player} расставил фигуры.`)
  return game
}

export function startGame(game: NumberJanggiGame, first: string): NumberJanggiGame {
  game.phase = 'live'
  game.turn = first
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  log(game, 'setup', `Игра началась, первым ходит ${first}.`)
  return game
}

// ---------- what a viewer sees ----------

export interface NjSquareView {
  square: number
  side: Side | null
  kind: NjKind | null
  value: number | null
  revealed: boolean
  id: string | null
}

export interface NjView {
  id: string
  name: string
  phase: NjPhase
  ec: string | null
  opponent: string | null
  mySide: Side | null
  board: NjSquareView[]
  myPieces: { id: string; kind: NjKind; value: number; square: number; alive: boolean }[]
  moves: Record<string, number[]>
  removed: { side: Side; kind: NjKind; value: number }[]
  turn: string | null
  deadline: number | null
  reserveMs: Record<string, number>
  reinforcing: string | null
  returnable: { id: string; value: number }[]
  returnSquares: number[]
  placed: Record<string, boolean>
  winner: string | null
  isDuelist: boolean
  log: NjLogEntry[]
}

export function viewFor(game: NumberJanggiGame, username: string): NjView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)
  const mySide = isDuelist ? sideOf(game, username) : null
  const over = game.phase === 'finished'

  const board: NjSquareView[] = Array.from({ length: COLS * ROWS }, (_, square) => {
    const piece = pieceAt(game, square)
    if (!piece) return { square, side: null, kind: null, value: null, revealed: false, id: null }
    const open = over || piece.revealed || piece.side === mySide
    return {
      square,
      side: piece.side,
      kind: open ? piece.kind : null,
      value: open ? piece.value : null,
      revealed: piece.revealed,
      id: piece.side === mySide ? piece.id : null,
    }
  })

  const mine = isDuelist ? game.pieces.filter(p => p.side === mySide) : []
  const moves: Record<string, number[]> = {}
  if (isDuelist && game.phase === 'live' && game.turn === username && !game.reinforcing) {
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
    myPieces: mine.map(p => ({ id: p.id, kind: p.kind, value: p.value, square: p.square, alive: p.alive })),
    moves,
    // what has fallen is public, which is the only bookkeeping anybody gets
    removed: game.pieces.filter(p => !p.alive).map(p => ({ side: p.side, kind: p.kind, value: p.value })),
    turn: game.turn,
    deadline: limit?.deadline ?? null,
    reserveMs: game.reserveMs,
    reinforcing: game.reinforcing,
    returnable: game.reinforcing === username
      ? mine.filter(p => !p.alive && p.kind === 'soldier').map(p => ({ id: p.id, value: p.value }))
      : [],
    returnSquares: game.reinforcing === username && mySide
      ? Array.from({ length: COLS }, (_, col) => backRow(mySide) * COLS + col)
        .filter(square => !pieceAt(game, square))
      : [],
    placed: game.placed,
    winner: game.winner,
    isDuelist,
    log: game.log,
  }
}
