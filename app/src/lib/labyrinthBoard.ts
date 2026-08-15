// Labyrinth board data and geometry. No fs here: the client imports this module
// directly to draw the maze, so it must stay free of node-only calls.

export const SIZE = 7

export type Orient =
  | 'upT' | 'rightT' | 'downT' | 'leftT'
  | 'upL' | 'rightL' | 'downL' | 'leftL'
  | 'horiz' | 'vert'

export interface Openings { u: boolean; r: boolean; d: boolean; l: boolean }

/** A T is named after the arm opposite its closed side, an L after its first arm clockwise. */
export const OPENINGS: Record<Orient, Openings> = {
  upT:    { u: true,  r: true,  d: false, l: true  },
  rightT: { u: true,  r: true,  d: true,  l: false },
  downT:  { u: false, r: true,  d: true,  l: true  },
  leftT:  { u: true,  r: false, d: true,  l: true  },
  upL:    { u: true,  r: true,  d: false, l: false },
  rightL: { u: false, r: true,  d: true,  l: false },
  downL:  { u: false, r: false, d: true,  l: true  },
  leftL:  { u: true,  r: false, d: false, l: true  },
  horiz:  { u: false, r: true,  d: false, l: true  },
  vert:   { u: true,  r: false, d: true,  l: false },
}

export const ORIENTS = Object.keys(OPENINGS) as Orient[]

export const ORIENT_NAMES: Record<Orient, string> = {
  upT: 'T вверх', rightT: 'T вправо', downT: 'T вниз', leftT: 'T влево',
  upL: 'L вверх', rightL: 'L вправо', downL: 'L вниз', leftL: 'L влево',
  horiz: 'Горизонталь', vert: 'Вертикаль',
}

/** Rotating a tile a quarter turn clockwise maps each orientation onto the next. */
export const ROTATE_CW: Record<Orient, Orient> = {
  upT: 'rightT', rightT: 'downT', downT: 'leftT', leftT: 'upT',
  upL: 'rightL', rightL: 'downL', downL: 'leftL', leftL: 'upL',
  horiz: 'vert', vert: 'horiz',
}

// The starting maze, read off the original spreadsheet cell by cell.
export const START_TILES: Orient[] = [
  'rightL', 'vert', 'downT', 'vert', 'downT', 'upT', 'downL',
  'leftL', 'downT', 'rightL', 'leftL', 'vert', 'vert', 'leftL',
  'rightT', 'upL', 'rightT', 'upL', 'downT', 'downL', 'leftT',
  'upL', 'vert', 'upT', 'upL', 'rightL', 'vert', 'upT',
  'rightT', 'rightL', 'upT', 'vert', 'leftT', 'horiz', 'leftT',
  'upT', 'rightL', 'horiz', 'leftT', 'horiz', 'vert', 'downL',
  'upL', 'horiz', 'upT', 'downL', 'upT', 'leftL', 'leftL',
]

/** Twenty four chests, the alphabet without L and T. */
export const START_LETTERS: (string | null)[] = [
  null, null, 'A', null, 'B', 'C', null,
  'D', 'E', null, 'F', null, null, null,
  'G', null, 'H', null, 'I', null, 'J',
  'K', null, 'M', 'N', null, null, 'O',
  'P', 'Q', 'R', null, 'S', null, 'U',
  'V', null, null, 'W', null, null, 'X',
  null, null, 'Y', null, 'Z', null, null,
]

export const START_ACTIVE: Orient = 'horiz'

export const LETTERS = START_LETTERS.filter((l): l is string => l !== null)

export type Colour = 'red' | 'yellow' | 'blue' | 'green'

/** Seats run clockwise from the top left corner. */
export const COLOURS: Colour[] = ['red', 'yellow', 'blue', 'green']

export const COLOUR_NAMES: Record<Colour, string> = {
  red: 'Красный', yellow: 'Жёлтый', blue: 'Синий', green: 'Зелёный',
}

export const COLOUR_HEX: Record<Colour, string> = {
  red: '#e02020', yellow: '#f2d02a', blue: '#0070c0', green: '#00b050',
}

export const BASE_OF: Record<Colour, number> = {
  red: 0, yellow: 6, blue: 48, green: 42,
}

export const indexOf = (col: number, row: number): number => row * SIZE + col
export const colOf = (index: number): number => index % SIZE
export const rowOf = (index: number): number => Math.floor(index / SIZE)

export interface Gate {
  id: number
  /** which edge the tile is shoved in from */
  side: 'top' | 'bottom' | 'left' | 'right'
  /** the column for top and bottom gates, the row for left and right ones */
  line: number
}

// Only the odd rows and columns slide, so the tiles on even coordinates never move.
export const GATES: Gate[] = [
  { id: 1,  side: 'top',    line: 1 },
  { id: 2,  side: 'top',    line: 3 },
  { id: 3,  side: 'top',    line: 5 },
  { id: 4,  side: 'left',   line: 1 },
  { id: 5,  side: 'right',  line: 1 },
  { id: 6,  side: 'left',   line: 3 },
  { id: 7,  side: 'right',  line: 3 },
  { id: 8,  side: 'left',   line: 5 },
  { id: 9,  side: 'right',  line: 5 },
  { id: 10, side: 'bottom', line: 1 },
  { id: 11, side: 'bottom', line: 3 },
  { id: 12, side: 'bottom', line: 5 },
]

/** Shoving a line straight back where it came from is forbidden. */
export const OPPOSITE_GATE: Record<number, number> = {
  1: 10, 10: 1, 2: 11, 11: 2, 3: 12, 12: 3,
  4: 5, 5: 4, 6: 7, 7: 6, 8: 9, 9: 8,
}

export const gateById = (id: number): Gate | undefined => GATES.find(g => g.id === id)

/** The cells a gate pushes through, in the order the tiles travel. */
export function laneOf(gate: Gate): number[] {
  const range = Array.from({ length: SIZE }, (_, i) => i)
  switch (gate.side) {
    case 'top':    return range.map(row => indexOf(gate.line, row))
    case 'bottom': return range.map(row => indexOf(gate.line, SIZE - 1 - row))
    case 'left':   return range.map(col => indexOf(col, gate.line))
    case 'right':  return range.map(col => indexOf(SIZE - 1 - col, gate.line))
  }
}

export interface ShoveResult {
  tiles: Orient[]
  letters: (string | null)[]
  /** the tile squeezed out of the far side, which becomes the next active piece */
  ejected: Orient
  /** where each pawn ends up, keyed the same way it came in */
  pawns: Record<string, number>
}

/**
 * Slides one line along by a tile. A pawn carried off the far edge reappears on the
 * freshly inserted tile at the near edge.
 */
export function shove(
  tiles: Orient[],
  letters: (string | null)[],
  pawns: Record<string, number>,
  gate: Gate,
  piece: Orient,
): ShoveResult {
  const lane = laneOf(gate)
  const nextTiles = [...tiles]
  const nextLetters = [...letters]
  const ejected = tiles[lane[SIZE - 1]]

  for (let i = SIZE - 1; i > 0; i--) {
    nextTiles[lane[i]] = tiles[lane[i - 1]]
    nextLetters[lane[i]] = letters[lane[i - 1]]
  }
  nextTiles[lane[0]] = piece
  nextLetters[lane[0]] = null

  const nextPawns: Record<string, number> = {}
  for (const [who, at] of Object.entries(pawns)) {
    const step = lane.indexOf(at)
    if (step < 0) { nextPawns[who] = at; continue }
    nextPawns[who] = step === SIZE - 1 ? lane[0] : lane[step + 1]
  }

  return { tiles: nextTiles, letters: nextLetters, ejected, pawns: nextPawns }
}

/** Two neighbours join only when both of them open onto the shared edge. */
export function connected(tiles: Orient[], from: number, to: number): boolean {
  const a = OPENINGS[tiles[from]]
  const b = OPENINGS[tiles[to]]
  const dc = colOf(to) - colOf(from)
  const dr = rowOf(to) - rowOf(from)
  if (dc === 1 && dr === 0) return a.r && b.l
  if (dc === -1 && dr === 0) return a.l && b.r
  if (dc === 0 && dr === 1) return a.d && b.u
  if (dc === 0 && dr === -1) return a.u && b.d
  return false
}

/** Every square the pawn can walk to, itself included. */
export function reachable(tiles: Orient[], from: number): number[] {
  const seen = new Set<number>([from])
  const queue = [from]
  while (queue.length > 0) {
    const at = queue.shift() as number
    const col = colOf(at)
    const row = rowOf(at)
    const neighbours = [
      row > 0 ? indexOf(col, row - 1) : -1,
      col < SIZE - 1 ? indexOf(col + 1, row) : -1,
      row < SIZE - 1 ? indexOf(col, row + 1) : -1,
      col > 0 ? indexOf(col - 1, row) : -1,
    ]
    for (const to of neighbours) {
      if (to < 0 || seen.has(to)) continue
      if (!connected(tiles, at, to)) continue
      seen.add(to)
      queue.push(to)
    }
  }
  return [...seen].sort((a, b) => a - b)
}
