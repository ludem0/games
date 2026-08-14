import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// The Cube: eight players walking the vertices of a cube, collecting a card at
// every corner and settling collisions with rock paper scissors.

const PATH = join(process.cwd(), 'thecube.json')

export const ROUNDS = 18
export const ROUND_MS = 24 * 60 * 60 * 1000
export const LOCATION_COST = 1
export const MESSAGE_COST = 1
export const RANDOM_RPS_COST = 5

export type Face = 'red' | 'yellow' | 'blue' | 'green' | 'orange' | 'pink'
/** three axes of opposite faces, so a vertex takes one colour from each */
export const AXES: [Face, Face][] = [['red', 'yellow'], ['blue', 'green'], ['orange', 'pink']]
export const FACE_NAMES: Record<Face, string> = {
  red: 'красная', yellow: 'жёлтая', blue: 'синяя',
  green: 'зелёная', orange: 'оранжевая', pink: 'розовая',
}

export type Rps = 'rock' | 'paper' | 'scissors'
export const RPS: Rps[] = ['rock', 'paper', 'scissors']
export const RPS_NAMES: Record<Rps, string> = { rock: 'камень', paper: 'бумага', scissors: 'ножницы' }

/** A vertex is the three faces that meet there, one from each axis. */
export type Vertex = number     // bit per axis: 0 for the first face, 1 for the second

export const VERTICES: Vertex[] = [0, 1, 2, 3, 4, 5, 6, 7]

export function facesOf(vertex: Vertex): Face[] {
  return AXES.map((pair, axis) => pair[(vertex >> axis) & 1])
}

export function vertexName(vertex: Vertex): string {
  return facesOf(vertex).map(f => FACE_NAMES[f]).join(' + ')
}

/** Neighbours differ on exactly one axis, and the edge keeps the other two faces. */
export function neighboursOf(vertex: Vertex): { vertex: Vertex; edge: [Face, Face] }[] {
  return [0, 1, 2].map(axis => {
    const target = vertex ^ (1 << axis)
    const shared = facesOf(vertex).filter((_, i) => i !== axis) as [Face, Face]
    return { vertex: target, edge: shared }
  })
}

export function edgeBetween(a: Vertex, b: Vertex): [Face, Face] | null {
  const found = neighboursOf(a).find(n => n.vertex === b)
  return found ? found.edge : null
}

// ---------- rock paper scissors ----------

export type Beat = 'win' | 'lose' | 'draw'

/** No card is a loss against anything, including another empty hand. */
export function compare(mine: Rps | null, theirs: Rps | null): Beat {
  if (!mine && !theirs) return 'lose'
  if (!mine) return 'lose'
  if (!theirs) return 'win'
  if (mine === theirs) return 'draw'
  const beats: Record<Rps, Rps> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
  return beats[mine] === theirs ? 'win' : 'lose'
}

/** Wins cancel losses, and whatever is left over decides the encounter. */
export function overall(mine: Rps | null, others: (Rps | null)[]): Beat {
  const net = others.reduce((total, theirs) => {
    const result = compare(mine, theirs)
    return total + (result === 'win' ? 1 : result === 'lose' ? -1 : 0)
  }, 0)
  return net > 0 ? 'win' : net < 0 ? 'lose' : 'draw'
}

// ---------- discarding ----------

export interface DiscardEffect {
  card: number
  text: string
  /** the engine can run these on its own; the rest need a choice from the player */
  automatic: boolean
}

export const DISCARDS: DiscardEffect[] = [
  { card: 0, text: 'Возьмите любую числовую карту на выбор.', automatic: false },
  { card: 1, text: 'Слейте две числовые карты в одну со значением их суммы по модулю 9.', automatic: false },
  { card: 2, text: 'Получите по одной карте RPS каждого вида, но следующую числовую карту вы не получите. Сброс этой карты стоит 2 псигема.', automatic: true },
  { card: 3, text: 'Получите две карты «бумага».', automatic: true },
  { card: 4, text: 'Слейте три числовые карты в одну со значением суммы по модулю 9, оставив себе копию наименьшей из них.', automatic: false },
  { card: 5, text: 'Получите две разные карты RPS случайно.', automatic: true },
  { card: 6, text: 'Получите 2 псигема и случайную карту RPS.', automatic: true },
  { card: 7, text: 'Получите две одинаковые карты RPS случайно.', automatic: true },
  { card: 8, text: 'Получите по одной карте RPS каждого вида.', automatic: true },
  { card: 9, text: 'Возьмите любую числовую карту на выбор. Сброс этой карты стоит 2 псигема.', automatic: false },
]

// ---------- state ----------

export type CubePhase = 'setup' | 'live' | 'finished'

export interface CubePlayer {
  home: Vertex
  at: Vertex
  /** every numbered card held, duplicates and all */
  cards: number[]
  rps: Rps[]
  /** which number each visited vertex pays, fixed on the first visit */
  visited: Record<number, number>
  /** set by discarding a two: the next card owed is skipped */
  skipNext: boolean
  finishedRound: number | null
}

export interface CubeMove {
  to: Vertex
  rps: Rps | null
}

export interface CubeRound {
  number: number
  deadline: string
  moves: Record<string, CubeMove>
  /** trades offered this round, matched pairwise before anybody moves */
  trades: Record<string, { partner: string; give: number; take: number }>
  report: Record<string, string[]> | null
}

export interface CubeLogEntry {
  at: string
  text: string
  kind: 'setup' | 'round' | 'battle' | 'alarm' | 'end'
}

export interface TheCubeGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: CubePhase
  players: string[]
  seats: Record<string, CubePlayer>
  rounds: CubeRound[]
  winner: string | null
  paidOut?: boolean
  log: CubeLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, TheCubeGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, TheCubeGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): TheCubeGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: TheCubeGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): TheCubeGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: TheCubeGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup', players: [], seats: {}, rounds: [],
    winner: null, log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: TheCubeGame): TheCubeGame {
  return { ...game, phase: 'setup', players: [], seats: {}, rounds: [], winner: null, paidOut: false, log: [] }
}

function log(game: TheCubeGame, kind: CubeLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

export function currentRound(game: TheCubeGame): CubeRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

export function uniqueCards(seat: CubePlayer): number[] {
  return [...new Set(seat.cards)].sort((a, b) => a - b)
}

export function hasFullSet(seat: CubePlayer): boolean {
  const held = new Set(seat.cards)
  return [1, 2, 3, 4, 5, 6, 7, 8].every(n => held.has(n))
}

export function alarmCount(game: TheCubeGame): number {
  return game.players.filter(p => hasFullSet(game.seats[p])).length
}

// ---------- the match ----------

export type Charge = (player: string, psigems: number) => void

function openRound(game: TheCubeGame): void {
  game.rounds = [...game.rounds, {
    number: game.rounds.length + 1,
    deadline: new Date(Date.now() + ROUND_MS).toISOString(),
    moves: {}, trades: {}, report: null,
  }]
}

export function startGame(game: TheCubeGame, players: string[]): TheCubeGame {
  const homes = shuffle(VERTICES).slice(0, players.length)
  game.players = players
  game.seats = Object.fromEntries(players.map((player, i) => [player, {
    home: homes[i],
    at: homes[i],
    cards: [1],
    rps: [...RPS],
    // the starting corner is the first vertex visited, and it pays a one
    visited: { [homes[i]]: 1 },
    skipNext: false,
    finishedRound: null,
  }]))
  game.rounds = []
  game.phase = 'live'
  openRound(game)
  log(game, 'setup', `Игра началась, на кубе ${players.length} человек.`)
  return game
}

/** The number a vertex pays this player, fixed the first time they stand on it. */
function cardForVertex(seat: CubePlayer, vertex: Vertex): number {
  if (seat.visited[vertex] != null) return seat.visited[vertex]
  const value = Object.keys(seat.visited).length + 1
  seat.visited[vertex] = value
  return value
}

function give(seat: CubePlayer, card: number): boolean {
  if (seat.skipNext) {
    seat.skipNext = false
    return false
  }
  seat.cards = [...seat.cards, card]
  return true
}

function resolveTrades(game: TheCubeGame, round: CubeRound): void {
  const done = new Set<string>()
  for (const [player, offer] of Object.entries(round.trades)) {
    if (done.has(player)) continue
    const theirs = round.trades[offer.partner]
    if (!theirs || theirs.partner !== player) continue
    if (theirs.give !== offer.take || theirs.take !== offer.give) continue

    const mine = game.seats[player]
    const other = game.seats[offer.partner]
    if (mine.at !== other.at) continue
    if (!mine.cards.includes(offer.give) || !other.cards.includes(theirs.give)) continue

    mine.cards = removeOne(mine.cards, offer.give)
    other.cards = removeOne(other.cards, theirs.give)
    mine.cards = [...mine.cards, theirs.give]
    other.cards = [...other.cards, offer.give]
    done.add(player)
    done.add(offer.partner)
    log(game, 'round', `${player} и ${offer.partner} обменялись картами.`)
  }
}

/** Drops a single copy, leaving any duplicates alone. */
function removeOne<T>(items: T[], item: T): T[] {
  const index = items.indexOf(item)
  return index < 0 ? items : items.filter((_, i) => i !== index)
}

/**
 * Everyone steps at once. Players landing on the same vertex from different
 * edges fight, the losers are pushed back, and the winners take a bonus card.
 */
export function closeRound(game: TheCubeGame): TheCubeGame {
  const round = currentRound(game)
  if (!round || round.report) return game

  resolveTrades(game, round)

  // silence walks a random edge with no card played
  for (const player of game.players) {
    if (round.moves[player]) continue
    const options = neighboursOf(game.seats[player].at)
    round.moves[player] = { to: shuffle(options)[0].vertex, rps: null }
    log(game, 'round', `${player} не сдал ход и пошёл случайно.`)
  }

  const report: Record<string, string[]> = Object.fromEntries(game.players.map(p => [p, []]))
  const arrivals = new Map<Vertex, string[]>()
  for (const player of game.players) {
    const target = round.moves[player].to
    arrivals.set(target, [...(arrivals.get(target) ?? []), player])
  }

  const losers = new Set<string>()
  const winners = new Set<string>()

  for (const [vertex, group] of arrivals) {
    if (group.length < 2) continue
    for (const player of group) {
      // everyone who came in along a different edge is an opponent
      const from = game.seats[player].at
      const rivals = group.filter(other =>
        other !== player && game.seats[other].at !== from)
      if (rivals.length === 0) continue

      const result = overall(round.moves[player].rps, rivals.map(r => round.moves[r].rps))
      if (result === 'win') winners.add(player)
      if (result === 'lose') losers.add(player)
      report[player] = [...report[player],
        `Столкновение на вершине ${vertexName(vertex)} с ${rivals.join(', ')}: ` +
        `${rivals.map(r => RPS_NAMES[round.moves[r].rps ?? 'rock']).join(', ')} против ` +
        `${round.moves[player].rps ? RPS_NAMES[round.moves[player].rps!] : 'без карты'} — ` +
        `${result === 'win' ? 'победа' : result === 'lose' ? 'поражение' : 'ничья'}.`]
    }
  }

  for (const player of game.players) {
    const seat = game.seats[player]
    const move = round.moves[player]
    // a played card is spent whether or not a battle happened
    if (move.rps) seat.rps = removeOne(seat.rps, move.rps)
    if (losers.has(player)) {
      report[player] = [...report[player], 'Вы отброшены назад и карту не получили.']
      continue
    }
    seat.at = move.to
    const card = cardForVertex(seat, move.to)
    const taken = give(seat, card)
    report[player] = [...report[player],
      taken ? `Вершина ${vertexName(move.to)} даёт карту ${card}.` : 'Карта пропущена из-за сброшенной двойки.']

    if (winners.has(player)) {
      const range = Object.keys(seat.visited).length
      const bonus = 1 + Math.floor(Math.random() * Math.max(1, range))
      seat.cards = [...seat.cards, bonus]
      report[player] = [...report[player], `Победа в столкновении: дополнительная карта ${bonus}.`]
    }
  }

  round.report = report
  const alarms = alarmCount(game)
  if (alarms > 0) log(game, 'alarm', `Полный набор 1-8 собрали: ${alarms} чел.`)

  const home = game.players.find(p => hasFullSet(game.seats[p]) && game.seats[p].at === game.seats[p].home)
  if (home) {
    game.seats[home].finishedRound = round.number
    return finish(game, home)
  }
  if (game.rounds.length >= ROUNDS) return finish(game, null)

  openRound(game)
  return game
}

export function finish(game: TheCubeGame, winner: string | null): TheCubeGame {
  game.phase = 'finished'
  game.winner = winner ?? winnersByCards(game)[0] ?? null
  log(game, 'end', `Матч окончен. Победа: ${game.winner ?? 'никто'}.`)
  return game
}

/** With nobody home in time, the deepest collection wins. */
export function winnersByCards(game: TheCubeGame): string[] {
  if (game.players.length === 0) return []
  const best = Math.max(...game.players.map(p => uniqueCards(game.seats[p]).length))
  const leaders = game.players.filter(p => uniqueCards(game.seats[p]).length === best)
  if (leaders.length < 6) return leaders
  // a crowd at the top is split by the biggest number held
  const highest = Math.max(...leaders.map(p => Math.max(...game.seats[p].cards)))
  return leaders.filter(p => Math.max(...game.seats[p].cards) === highest)
}

export function losersOf(game: TheCubeGame): string[] {
  if (game.players.length === 0) return []
  const worst = Math.min(...game.players.map(p => uniqueCards(game.seats[p]).length))
  return game.players.filter(p => uniqueCards(game.seats[p]).length === worst)
}

export interface CubePayout {
  psigems: Record<string, number>
  tol: Record<string, number>
  opals: Record<string, number>
  clearOpals: Record<string, number>
}

/** A psigem for every unique card, and two tokens for a lone winner. */
export function payoutFor(game: TheCubeGame): CubePayout {
  const psigems: Record<string, number> = {}
  const tol: Record<string, number> = {}
  const opals: Record<string, number> = {}
  const clearOpals: Record<string, number> = {}

  for (const player of game.players) {
    const unique = uniqueCards(game.seats[player]).filter(c => c >= 1 && c <= 8).length
    if (unique > 0) psigems[player] = unique
  }
  const winners = game.winner ? [game.winner] : winnersByCards(game)
  if (winners.length === 1) tol[winners[0]] = 2

  // the opal wants a zero card at the end, and shares out as more people manage it
  const claimants = game.players.filter(p => game.seats[p].cards.includes(0))
  if (claimants.length === 1) opals[claimants[0]] = 1
  else if (claimants.length === 2) for (const p of claimants) clearOpals[p] = 1
  else if (claimants.length > 2) {
    const amount = Math.max(1, 5 - (claimants.length - 3))
    for (const p of claimants) psigems[p] = (psigems[p] ?? 0) + amount
  }
  return { psigems, tol, opals, clearOpals }
}

export function applyClock(game: TheCubeGame, now = Date.now()): TheCubeGame {
  if (game.phase !== 'live') return game
  const round = currentRound(game)
  if (!round || round.report || now < new Date(round.deadline).getTime()) return game
  return closeRound(game)
}

// ---------- what a viewer sees ----------

export interface CubeView {
  id: string
  name: string
  phase: CubePhase
  players: string[]
  roundNumber: number
  deadline: string | null
  myVertex: { id: Vertex; faces: Face[]; name: string } | null
  myHome: { id: Vertex; name: string } | null
  myCards: number[]
  myRps: Rps[]
  myMove: CubeMove | null
  /** the corners you can step to, and who you can see standing there */
  exits: { vertex: Vertex; edge: [Face, Face]; name: string; players: string[] }[]
  neighbours: string[]
  report: string[]
  alarms: number
  submitted: string[]
  amPlaying: boolean
  winner: string | null
  payout: CubePayout | null
  standings: { player: string; unique: number; cards: number | null }[]
  log: CubeLogEntry[]
}

export function viewFor(game: TheCubeGame, username: string, isAdmin: boolean): CubeView {
  const round = currentRound(game)
  const seat = game.seats[username] ?? null
  const previous = [...game.rounds].reverse().find(r => r.report) ?? null
  const over = game.phase === 'finished'

  const exits = seat ? neighboursOf(seat.at).map(({ vertex, edge }) => ({
    vertex,
    edge,
    name: `${FACE_NAMES[edge[0]]} + ${FACE_NAMES[edge[1]]}`,
    // you only ever see the corners you could step onto
    players: game.players.filter(p => p !== username && game.seats[p]?.at === vertex),
  })) : []

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    roundNumber: round?.number ?? 0,
    deadline: round && !round.report ? round.deadline : null,
    myVertex: seat ? { id: seat.at, faces: facesOf(seat.at), name: vertexName(seat.at) } : null,
    myHome: seat ? { id: seat.home, name: vertexName(seat.home) } : null,
    myCards: seat ? [...seat.cards].sort((a, b) => a - b) : [],
    myRps: seat?.rps ?? [],
    myMove: round?.moves[username] ?? null,
    exits,
    neighbours: seat
      ? game.players.filter(p => p !== username &&
        neighboursOf(seat.at).some(n => n.vertex === game.seats[p]?.at))
      : [],
    report: previous?.report?.[username] ?? [],
    alarms: alarmCount(game),
    submitted: round ? Object.keys(round.moves) : [],
    amPlaying: game.players.includes(username),
    winner: game.winner,
    payout: over ? payoutFor(game) : null,
    standings: game.players.map(player => ({
      player,
      unique: over || isAdmin ? uniqueCards(game.seats[player]).length : 0,
      cards: over || isAdmin || player === username ? game.seats[player].cards.length : null,
    })),
    log: isAdmin || over ? game.log : game.log.filter(e => e.kind === 'alarm' || e.kind === 'setup'),
  }
}
