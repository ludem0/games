import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runMachine, test, type Cond, type Rule, type Context } from './conveyorLang'

// Conveyor: nine pips loaded in order, sorted onto two tracks, pushed through
// six machines that rewrite their values, and sold to whoever wants them.

const PATH = join(process.cwd(), 'conveyor.json')

export const PIPS = 9
export const TRACK_LIMIT = 5
export const SLOTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type Slot = typeof SLOTS[number]
/** A, C and E sit on the upper track, B, D and F on the lower one */
export const UPPER_SLOTS: Slot[] = ['A', 'C', 'E']
export const LOWER_SLOTS: Slot[] = ['B', 'D', 'F']
export const ROUNDS_TO_WIN = 2

export type Colour = 'red' | 'blue' | 'green'
export type Track = 'upper' | 'lower'
export type BuyerKind = 'single' | 'repeat' | 'degrade' | 'compete'
export type CvPhase = 'setup' | 'loading' | 'machines' | 'tracks' | 'market' | 'finished'

export interface Machine {
  id: string
  name: string
  colour: Colour
  rules: Rule[]
}

export interface Buyer {
  id: string
  kind: BuyerKind
  price: number
  /** how many pips they take at a time */
  count: number
  condition: Cond
  text: string
}

export interface RoundSetup {
  pips: number[]
  machines: Machine[]
  /** which colour each slot on the conveyor demands */
  slotColours: Record<Slot, Colour>
  buyers: Buyer[]
}

export interface Sale {
  buyer: string
  pips: number[]
}

export interface CvPlayerRound {
  loader: (number | null)[]
  placements: Partial<Record<Slot, string>>
  tracks: Record<number, Track>
  /** what came out the far end of the conveyor */
  output: number[]
  sales: Sale[]
  gold: number
  goldByPrice: Record<number, number>
  itemsUsed: string[]
}

export interface CvRound {
  number: number
  setup: RoundSetup
  players: Record<string, CvPlayerRound>
  winner: string | null
  report: string[]
}

export interface CvLogEntry {
  at: string
  text: string
  kind: 'setup' | 'load' | 'machine' | 'market' | 'end'
}

export interface ConveyorGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  phase: CvPhase
  /** which of the three stage submissions the loading is on */
  loadStage: number
  rounds: CvRound[]
  wins: Record<string, number>
  /** the three star item decides the very last tiebreak */
  threeStarOwner: string | null
  winner: string | null
  log: CvLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, ConveyorGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, ConveyorGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): ConveyorGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: ConveyorGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): ConveyorGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: ConveyorGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup', loadStage: 0, rounds: [], wins: {},
    threeStarOwner: null, winner: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: ConveyorGame): ConveyorGame {
  return {
    ...game,
    phase: 'setup', loadStage: 0, rounds: [], wins: {},
    threeStarOwner: null, winner: null, log: [],
  }
}

function log(game: ConveyorGame, kind: CvLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function duelists(game: ConveyorGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: ConveyorGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

export function currentRound(game: ConveyorGame): CvRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

// ---------- the conveyor ----------

/**
 * Sends the nine pips through the machines. Pips reach a machine in loader
 * order, and every pip clears one machine before the next one starts.
 */
export function runConveyor(
  setup: RoundSetup,
  loader: (number | null)[],
  tracks: Record<number, Track>,
  placements: Partial<Record<Slot, string>>,
  skipped: number[] = [],
): { output: number[]; trail: string[] } {
  const vars: Context['vars'] = { P: 1, Q: 1, R: 1, T: 1 }
  const trail: string[] = []

  // pips keep their loader order, split into the two tracks
  const carried = loader
    .map((value, position) => ({ value, position }))
    .filter((entry): entry is { value: number; position: number } => entry.value != null)

  const values = new Map<number, number>()
  for (const entry of carried) values.set(entry.position, entry.value)

  for (const slot of SLOTS) {
    const machineId = placements[slot]
    const machine = setup.machines.find(m => m.id === machineId)
    if (!machine) continue
    const track: Track = UPPER_SLOTS.includes(slot) ? 'upper' : 'lower'
    const queue = carried.filter(entry =>
      tracks[entry.position] === track && !skipped.includes(entry.position))

    queue.forEach((entry, index) => {
      const before = values.get(entry.position) ?? entry.value
      const result = runMachine(machine.rules, {
        pip: before,
        vars,
        index: index + 1,
        total: queue.length,
      })
      values.set(entry.position, result.pip)
      Object.assign(vars, result.vars)
      if (result.pip !== before) {
        trail.push(`${slot} (${machine.name}): ${before} стало ${result.pip}`)
      }
    })
  }

  return {
    output: carried.map(entry => values.get(entry.position) ?? entry.value),
    trail,
  }
}

// ---------- the market ----------

export interface SaleResult {
  gold: number
  byPrice: Record<number, number>
  problems: string[]
  /** what each competing buyer was offered, so both players can be compared */
  competes: Record<string, number[]>
}

const emptyContext = (pip: number): Context => ({ pip, vars: { P: 1, Q: 1, R: 1, T: 1 }, index: 1, total: 1 })

/** Prices one player's sales, before the competing buyers are settled. */
export function priceSales(setup: RoundSetup, output: number[], sales: Sale[]): SaleResult {
  const left = [...output]
  const byPrice: Record<number, number> = {}
  const problems: string[] = []
  const competes: Record<string, number[]> = {}
  const timesSold = new Map<string, number>()
  let gold = 0

  for (const sale of sales) {
    const buyer = setup.buyers.find(b => b.id === sale.buyer)
    if (!buyer) { problems.push(`Покупателя ${sale.buyer} нет`); continue }
    if (sale.pips.length !== buyer.count) {
      problems.push(`${buyer.id} берёт ${buyer.count} пипов за раз`)
      continue
    }
    // the pips have to actually be in hand
    const taken: number[] = []
    let missing = false
    for (const pip of sale.pips) {
      const index = left.indexOf(pip)
      if (index < 0) { missing = true; break }
      left.splice(index, 1)
      taken.push(pip)
    }
    if (missing) {
      for (const pip of taken) left.push(pip)
      problems.push(`Пипов ${sale.pips.join(', ')} у вас нет`)
      continue
    }
    if (!sale.pips.every(pip => test(buyer.condition, emptyContext(pip)))) {
      for (const pip of taken) left.push(pip)
      problems.push(`${buyer.id} такие пипы не берёт`)
      continue
    }

    const already = timesSold.get(buyer.id) ?? 0
    if (buyer.kind === 'single' && already >= 1) {
      for (const pip of taken) left.push(pip)
      problems.push(`${buyer.id} покупает только один раз за раунд`)
      continue
    }
    timesSold.set(buyer.id, already + 1)

    if (buyer.kind === 'compete') {
      competes[buyer.id] = sale.pips
      continue
    }
    const price = buyer.kind === 'degrade' ? Math.max(0, buyer.price - already) : buyer.price
    gold += price
    byPrice[price] = (byPrice[price] ?? 0) + price
  }

  return { gold, byPrice, problems, competes }
}

/**
 * The competing buyers pay only the better offer, and pay both on a tie. The
 * condition doubles as the comparison: a bigger number wins it.
 */
export function settleCompetes(
  setup: RoundSetup,
  offers: Record<string, Record<string, number[]>>,
): Record<string, { gold: number; byPrice: Record<number, number> }> {
  const players = Object.keys(offers)
  const result: Record<string, { gold: number; byPrice: Record<number, number> }> =
    Object.fromEntries(players.map(p => [p, { gold: 0, byPrice: {} }]))

  for (const buyer of setup.buyers.filter(b => b.kind === 'compete')) {
    const entries = players
      .map(player => ({ player, pips: offers[player]?.[buyer.id] ?? [] }))
      .filter(entry => entry.pips.length > 0)
    if (entries.length === 0) continue

    const best = Math.max(...entries.map(entry => Math.max(...entry.pips)))
    for (const entry of entries.filter(e => Math.max(...e.pips) === best)) {
      result[entry.player].gold += buyer.price
      result[entry.player].byPrice[buyer.price] = (result[entry.player].byPrice[buyer.price] ?? 0) + buyer.price
    }
  }
  return result
}

/** Gold first, then the three and two gold takings, then the pips themselves. */
export function roundWinner(game: ConveyorGame, round: CvRound): string | null {
  const [a, b] = duelists(game)
  if (!a || !b) return null
  const left = round.players[a]
  const right = round.players[b]
  if (!left || !right) return null

  if (left.gold !== right.gold) return left.gold > right.gold ? a : b
  for (const price of [3, 2]) {
    const l = left.goldByPrice[price] ?? 0
    const r = right.goldByPrice[price] ?? 0
    if (l !== r) return l > r ? a : b
  }
  const sum = (pips: number[]): number => pips.reduce((total, pip) => total + pip, 0)
  if (sum(left.output) !== sum(right.output)) return sum(left.output) > sum(right.output) ? a : b

  const sortedLeft = [...left.output].sort((x, y) => y - x)
  const sortedRight = [...right.output].sort((x, y) => y - x)
  for (let i = 0; i < Math.max(sortedLeft.length, sortedRight.length); i++) {
    const l = sortedLeft[i] ?? -Infinity
    const r = sortedRight[i] ?? -Infinity
    if (l !== r) return l > r ? a : b
  }
  // everything level, so the three star item settles it
  return game.threeStarOwner
}

// ---------- the items ----------

export function swapPips(loader: (number | null)[], from: number, to: number): (number | null)[] {
  const copy = [...loader]
  const keep = copy[from]
  copy[from] = copy[to]
  copy[to] = keep
  return copy
}

export function increasePip(loader: (number | null)[], position: number): (number | null)[] {
  return loader.map((value, i) => (i === position && value != null ? value + 1 : value))
}

// ---------- running a round ----------

export function startRound(game: ConveyorGame, setup: RoundSetup): ConveyorGame {
  game.rounds = [...game.rounds, {
    number: game.rounds.length + 1,
    setup,
    players: Object.fromEntries(duelists(game).map(player => [player, {
      loader: Array(PIPS).fill(null),
      placements: {},
      tracks: {},
      output: [],
      sales: [],
      gold: 0,
      goldByPrice: {},
      itemsUsed: [],
    }])),
    winner: null,
    report: [],
  }]
  game.phase = 'loading'
  game.loadStage = 1
  log(game, 'setup', `Раунд ${game.rounds.length} начался. Загрузка первой тройки.`)
  return game
}

/** Fills whatever the player left blank with their lowest unplaced pips. */
export function autoFill(round: CvRound, player: string): void {
  const seat = round.players[player]
  const placed = seat.loader.filter((value): value is number => value != null)
  const spare = [...round.setup.pips]
  for (const value of placed) {
    const index = spare.indexOf(value)
    if (index >= 0) spare.splice(index, 1)
  }
  spare.sort((a, b) => a - b)
  for (let i = 0; i < seat.loader.length && spare.length > 0; i++) {
    if (seat.loader[i] == null) seat.loader[i] = spare.shift()!
  }
}

export function processRound(game: ConveyorGame): ConveyorGame {
  const round = currentRound(game)
  if (!round) return game

  for (const player of duelists(game)) {
    const seat = round.players[player]
    autoFill(round, player)
    // an unassigned pip fills the upper track first, then the lower one
    let upper = Object.values(seat.tracks).filter(t => t === 'upper').length
    seat.loader.forEach((value, position) => {
      if (value == null || seat.tracks[position]) return
      if (upper < TRACK_LIMIT) {
        seat.tracks[position] = 'upper'
        upper += 1
      } else {
        seat.tracks[position] = 'lower'
      }
    })
    const skipped = seat.itemsUsed
      .filter(item => item.startsWith('skip:'))
      .map(item => Number(item.split(':')[1]))
    const { output, trail } = runConveyor(round.setup, seat.loader, seat.tracks, seat.placements, skipped)
    seat.output = output
    for (const line of trail.slice(0, 12)) log(game, 'machine', `${player}: ${line}`)
  }

  game.phase = 'market'
  log(game, 'machine', 'Пипы прошли конвейер, открыт рынок.')
  return game
}

export function closeMarket(game: ConveyorGame): ConveyorGame {
  const round = currentRound(game)
  if (!round) return game

  const offers: Record<string, Record<string, number[]>> = {}
  for (const player of duelists(game)) {
    const seat = round.players[player]
    const priced = priceSales(round.setup, seat.output, seat.sales)
    seat.gold = priced.gold
    seat.goldByPrice = priced.byPrice
    offers[player] = priced.competes
    for (const problem of priced.problems) round.report.push(`${player}: ${problem}`)
  }

  const competes = settleCompetes(round.setup, offers)
  for (const player of duelists(game)) {
    const extra = competes[player]
    if (!extra) continue
    const seat = round.players[player]
    seat.gold += extra.gold
    for (const [price, amount] of Object.entries(extra.byPrice)) {
      seat.goldByPrice[Number(price)] = (seat.goldByPrice[Number(price)] ?? 0) + amount
    }
  }

  round.winner = roundWinner(game, round)
  if (round.winner) {
    game.wins = { ...game.wins, [round.winner]: (game.wins[round.winner] ?? 0) + 1 }
    round.report.push(`Раунд забирает ${round.winner}`)
  }
  log(game, 'market', `Раунд ${round.number}: ` +
    duelists(game).map(p => `${p} ${round.players[p].gold} золота`).join(', '))

  const champion = duelists(game).find(p => (game.wins[p] ?? 0) >= ROUNDS_TO_WIN)
  if (champion) {
    game.phase = 'finished'
    game.winner = champion
    log(game, 'end', `Победа в дэтматче: ${champion}`)
    return game
  }
  game.phase = 'setup'
  return game
}

// ---------- what a viewer sees ----------

export interface CvView {
  id: string
  name: string
  phase: CvPhase
  ec: string | null
  opponent: string | null
  roundNumber: number
  loadStage: number
  wins: Record<string, number>
  /** the pips you were handed this round */
  myPips: number[]
  myLoader: (number | null)[]
  myTracks: Record<number, Track>
  myPlacements: Partial<Record<string, string>>
  myOutput: number[]
  mySales: Sale[]
  myGold: number
  rivalLoader: (number | null)[] | null
  rivalOutput: number[]
  machines: { id: string; name: string; colour: Colour }[]
  slotColours: Record<string, Colour> | null
  buyers: Buyer[]
  report: string[]
  winner: string | null
  isDuelist: boolean
  log: CvLogEntry[]
}

export function viewFor(game: ConveyorGame, username: string): CvView {
  const round = currentRound(game)
  const isDuelist = duelists(game).includes(username)
  const seat = round?.players[username] ?? null
  const rival = isDuelist ? other(game, username) : null
  const rivalSeat = rival ? round?.players[rival] ?? null : null
  // the loaders open up to both players once loading is done
  const loadersOpen = game.phase !== 'loading' && game.phase !== 'setup'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    roundNumber: round?.number ?? 0,
    loadStage: game.loadStage,
    wins: game.wins,
    myPips: round?.setup.pips ?? [],
    myLoader: seat?.loader ?? [],
    myTracks: seat?.tracks ?? {},
    myPlacements: seat?.placements ?? {},
    myOutput: seat?.output ?? [],
    mySales: seat?.sales ?? [],
    myGold: seat?.gold ?? 0,
    rivalLoader: loadersOpen ? rivalSeat?.loader ?? null : null,
    rivalOutput: game.phase === 'market' || game.phase === 'finished' ? rivalSeat?.output ?? [] : [],
    // the machines are known to everybody from the second loading stage on
    machines: game.loadStage >= 2 || game.phase !== 'loading'
      ? (round?.setup.machines ?? []).map(m => ({ id: m.id, name: m.name, colour: m.colour }))
      : [],
    slotColours: round?.setup.slotColours ?? null,
    buyers: game.loadStage >= 3 || game.phase !== 'loading' ? round?.setup.buyers ?? [] : [],
    report: round?.report ?? [],
    winner: game.winner,
    isDuelist,
    log: game.log,
  }
}
