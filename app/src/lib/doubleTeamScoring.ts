// Double Team scoring, kept pure so it can be reasoned about and tested on its own.

export type Sign = 'X' | 'O'
export type Colour = 'red' | 'yellow' | 'blue'

export const COLOURS: Colour[] = ['red', 'yellow', 'blue']
export const ROWS = 3
export const COLS = 4
export const MAX_SCORERS = 6
export const TARGET_POINTS = 5
export const UNIQUE_BONUS_LIMIT = 3

export interface Pick { sign: Sign; colour: Colour }

export interface Cell extends Pick {
  username: string
  row: number
  col: number
}

/** Which colour wins a tie depends on what the sign count asked for. */
const PRIORITY: Record<'least' | 'middle' | 'most', Colour[]> = {
  least: ['red', 'yellow', 'blue'],
  middle: ['yellow', 'blue', 'red'],
  most: ['blue', 'red', 'yellow'],
}

export interface RoundOutcome {
  /** players knocked out because their whole row or column matched */
  removed: string[]
  removedLines: string[]
  rule: 'least' | 'middle' | 'most'
  signCounts: Record<Sign, number>
  colourCounts: Record<Colour, number>
  targetColour: Colour | null
  scored: string[]
  /** true when more than six would have scored and the set was flipped */
  inverted: boolean
  /** the player who alone held a one-of-a-kind symbol, if there is exactly one */
  uniqueBonus: string | null
}

/** A whole row or column of one colour, or of one sign, takes its players out. */
export function uniformLines(cells: Cell[]): { players: string[]; lines: string[] } {
  const players = new Set<string>()
  const lines: string[] = []

  const check = (group: Cell[], label: string) => {
    if (group.length < 2) return
    const sameColour = group.every(c => c.colour === group[0].colour)
    const sameSign = group.every(c => c.sign === group[0].sign)
    if (!sameColour && !sameSign) return
    lines.push(`${label}: ${sameColour ? 'один цвет' : 'один знак'}`)
    for (const c of group) players.add(c.username)
  }

  for (let r = 0; r < ROWS; r++) check(cells.filter(c => c.row === r), `строка ${r + 1}`)
  for (let c = 0; c < COLS; c++) check(cells.filter(x => x.col === c), `столбец ${c + 1}`)

  return { players: [...players], lines }
}

/**
 * Colours that hold the wanted position by frequency. Only colours somebody
 * actually played can win, and a colour count nobody can claim is ignored.
 * With no strict middle (fewer than three distinct counts) every played colour
 * ties for it, and the priority list settles the tie.
 */
export function targetColours(counts: Record<Colour, number>, rule: 'least' | 'middle' | 'most'): Colour[] {
  const played = COLOURS.filter(c => counts[c] > 0)
  if (played.length === 0) return []

  const distinct = [...new Set(played.map(c => counts[c]))].sort((a, b) => b - a)

  if (rule === 'most') return played.filter(c => counts[c] === distinct[0])
  if (rule === 'least') return played.filter(c => counts[c] === distinct[distinct.length - 1])
  if (distinct.length >= 3) return played.filter(c => counts[c] === distinct[1])
  return played
}

export function resolveRound(cells: Cell[], immune: string[]): RoundOutcome {
  const uniform = uniformLines(cells)
  const removed = uniform.players.filter(p => !immune.includes(p))
  const alive = cells.filter(c => !removed.includes(c.username))

  const signCounts: Record<Sign, number> = { X: 0, O: 0 }
  const colourCounts: Record<Colour, number> = { red: 0, yellow: 0, blue: 0 }
  for (const c of alive) {
    signCounts[c.sign]++
    colourCounts[c.colour]++
  }

  const rule: 'least' | 'middle' | 'most' =
    signCounts.X > signCounts.O ? 'least' : signCounts.X === signCounts.O ? 'middle' : 'most'

  const candidates = targetColours(colourCounts, rule)
  const targetColour = candidates.length === 0
    ? null
    : PRIORITY[rule].find(c => candidates.includes(c)) ?? candidates[0]

  let scored = targetColour ? alive.filter(c => c.colour === targetColour).map(c => c.username) : []
  let inverted = false
  // at most six may score; beyond that the round pays everyone else who is still in
  if (scored.length > MAX_SCORERS) {
    scored = alive.filter(c => !scored.includes(c.username)).map(c => c.username)
    inverted = true
  }

  // a symbol nobody else chose, and only if exactly one player holds such a symbol
  const key = (c: Cell) => `${c.colour}-${c.sign}`
  const tally = new Map<string, string[]>()
  for (const c of cells) tally.set(key(c), [...(tally.get(key(c)) ?? []), c.username])
  const singles = [...tally.values()].filter(list => list.length === 1)
  const uniqueBonus = singles.length === 1 ? singles[0][0] : null

  return {
    removed,
    removedLines: uniform.lines,
    rule,
    signCounts,
    colourCounts,
    targetColour,
    scored,
    inverted,
    uniqueBonus,
  }
}

/**
 * A pick is refused if it repeats the colour from last round, or the sign from
 * the last two. History is newest first.
 */
export function pickIsLegal(pick: Pick, history: Pick[]): { ok: boolean; reason?: string } {
  if (history[0]?.colour === pick.colour) {
    return { ok: false, reason: 'Этот цвет был в прошлом раунде' }
  }
  if (history.length >= 2 && history[0]?.sign === pick.sign && history[1]?.sign === pick.sign) {
    return { ok: false, reason: 'Этот знак был два раунда подряд' }
  }
  return { ok: true }
}

/** Used when a player misses the deadline or breaks the repeat rules. */
export function randomPick(history: Pick[]): Pick {
  const options: Pick[] = []
  for (const sign of ['X', 'O'] as Sign[]) {
    for (const colour of COLOURS) {
      if (pickIsLegal({ sign, colour }, history).ok) options.push({ sign, colour })
    }
  }
  const pool = options.length > 0 ? options : [{ sign: 'X' as Sign, colour: 'red' as Colour }]
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Psigems handed out once the match is over. */
export function psigemsForPoints(points: number): number {
  if (points >= 5) return 3
  if (points >= 3) return 2
  if (points >= 1) return 1
  return 0
}
