import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Totemic Might: twenty totems of hidden weight, bought at auction and weighed
// on a trial balance, so that at the end three piles can be made to match.

const PATH = join(process.cwd(), 'totemic.json')

export const SEASONS = ['Лето', 'Пустота', 'Весна', 'Зима'] as const
export const SIGILS = ['Тайна', 'Зверь', 'Будущее', 'Земля', 'Небо'] as const
export type Season = typeof SEASONS[number]
export type Sigil = typeof SIGILS[number]

export const TOTEM_COUNT = SEASONS.length * SIGILS.length     // twenty
export const START_CHIPS = 120
export const MIN_BID = 1
export const MAX_BID_SERIES = 10
export const MAX_BID_ROUND = 15
export const CHIP_THRESHOLD = 15
export const POOR_PLAYERS_TO_END = 3
export const SCALE_USES = 3
export const GUESS_PENALTY = 3
export const BEAR_COST = 2
export const BEAR_FINE_COST = 1
export const FOX_COST = 4

export type Wager = 'snake' | 'wolf' | 'bear' | 'fox'
export type TmPhase = 'setup' | 'auction' | 'final' | 'finished'

export interface Totem {
  id: number
  season: Season
  sigil: Sigil
  weight: number
}

export interface Balloon {
  id: string
  wager: Wager
  lift: number
  /** the wolf and the fox hand these over without saying how much they lift */
  known: boolean
}

export interface TmPlayer {
  chips: number
  /** the totem they started with, whose weight they know */
  spirit: number
  extraSpirits: number[]
  trial: number[]
  balloons: Balloon[]
  wagersUsed: number
  snakeUsed: number
  notes: string[]
  failures: number
  finalScore: number | null
}

export interface Series {
  name: string
  totems: number[]
}

export interface TmBid {
  amount: number
  /** the order the player wants the prizes in, by totem id or the word garnet */
  order: (number | 'garnet')[]
}

export interface TmRound {
  number: number
  deadline: string
  series: { a: Series; b: Series }
  bids: Record<string, { a?: TmBid; b?: TmBid }>
  wagers: Record<string, { kind: Wager; totems: number[]; letter?: string; fine?: boolean }>
  weighings: Record<string, { left: number[]; right: number[]; result: string }[]>
  report: string[] | null
}

export interface TmLogEntry {
  at: string
  text: string
  kind: 'setup' | 'auction' | 'scale' | 'wager' | 'final' | 'end'
}

export interface TotemicGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: TmPhase
  players: string[]
  totems: Totem[]
  seats: Record<string, TmPlayer>
  /** highest psigems first, and it shuffles as ties are used up */
  priority: string[]
  pool: number[]
  rounds: TmRound[]
  /** the letters the snake has already handed out */
  snakeTaken: string[]
  /** the player owed a free pick from the spare pool, if exactly one went empty */
  owedSpirit: string | null
  hints: Record<string, string>
  guesses: Record<string, Record<string, number>>
  paidOut?: boolean
  log: TmLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, TotemicGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, TotemicGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): TotemicGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: TotemicGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
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

/** One totem per season and sigil pair, with the weights one to twenty shuffled in. */
export function dealTotems(): Totem[] {
  const weights = shuffle(Array.from({ length: TOTEM_COUNT }, (_, i) => i + 1))
  const totems: Totem[] = []
  let index = 0
  for (const season of SEASONS) {
    for (const sigil of SIGILS) {
      totems.push({ id: index, season, sigil, weight: weights[index] })
      index += 1
    }
  }
  return totems
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): TotemicGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: TotemicGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup', players: [], totems: dealTotems(), seats: {},
    priority: [], pool: [], rounds: [], snakeTaken: [], owedSpirit: null, hints: {}, guesses: {},
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: TotemicGame): TotemicGame {
  return {
    ...game,
    phase: 'setup', players: [], totems: dealTotems(), seats: {},
    priority: [], pool: [], rounds: [], snakeTaken: [], owedSpirit: null, hints: {}, guesses: {},
    paidOut: false, log: [],
  }
}

function log(game: TotemicGame, kind: TmLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function currentRound(game: TotemicGame): TmRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

export function totemName(game: TotemicGame, id: number): string {
  const totem = game.totems[id]
  return totem ? `${totem.season}/${totem.sigil}` : `#${id}`
}

export function weightOf(game: TotemicGame, id: number): number {
  return game.totems[id]?.weight ?? 0
}

/** Everything a player may put on the scales right now. */
export function ownedTotems(seat: TmPlayer): number[] {
  return [seat.spirit, ...seat.extraSpirits, ...seat.trial]
}

// ---------- the auction ----------

/**
 * One series: the biggest bid picks first, ties broken by the priority list,
 * and everybody takes the first thing on their list still unclaimed.
 */
export function resolveSeries(
  game: TotemicGame,
  series: Series,
  bids: Record<string, TmBid>,
): { awards: Record<string, number | 'garnet'>; order: string[] } {
  const prizes: (number | 'garnet')[] = [...series.totems, 'garnet']
  const taken = new Set<number | 'garnet'>()
  const order = Object.keys(bids).sort((a, b) =>
    bids[b].amount - bids[a].amount
    || game.priority.indexOf(a) - game.priority.indexOf(b))

  const awards: Record<string, number | 'garnet'> = {}
  for (const player of order) {
    const wanted = bids[player].order.find(prize => prizes.includes(prize) && !taken.has(prize))
      ?? prizes.find(prize => !taken.has(prize))
    if (wanted == null) continue
    taken.add(wanted)
    awards[player] = wanted
  }
  return { awards, order }
}

/** Anyone who tied on a bid drops to the back of the priority list. */
function rotatePriority(game: TotemicGame, used: string[]): void {
  game.priority = [...game.priority.filter(p => !used.includes(p)), ...used]
}

// ---------- the wagers ----------

export function wolfResult(game: TotemicGame, a: number, b: number): number {
  return Math.abs(weightOf(game, a) - weightOf(game, b)) % 8
}

export function bearBand(total: number, fine: boolean): string {
  const width = fine ? 5 : 10
  const low = Math.floor((total - 1) / width) * width + 1
  return `${low}-${low + width - 1}`
}

export function foxTotal(game: TotemicGame, totems: number[]): number {
  return totems.reduce((sum, id) => sum + weightOf(game, id), 0)
}

/** The wolf wants two totems from different seasons that you do not own. */
export function wolfLegal(game: TotemicGame, seat: TmPlayer, totems: number[]): string | null {
  if (totems.length !== 2) return 'Нужны ровно два тотема'
  const [a, b] = totems.map(id => game.totems[id])
  if (!a || !b) return 'Такого тотема нет'
  if (a.season === b.season) return 'Тотемы должны быть из разных сезонов'
  const mine = [seat.spirit, ...seat.extraSpirits]
  if (totems.some(id => mine.includes(id))) return 'Свои духовные тотемы брать нельзя'
  return null
}

/** The fox wants three totems sharing neither a season nor a sigil. */
export function foxLegal(game: TotemicGame, totems: number[]): string | null {
  if (totems.length !== 3) return 'Нужны ровно три тотема'
  const picked = totems.map(id => game.totems[id])
  if (picked.some(t => !t)) return 'Такого тотема нет'
  if (new Set(picked.map(t => t!.season)).size !== 3) return 'Все три должны быть из разных сезонов'
  if (new Set(picked.map(t => t!.sigil)).size !== 3) return 'Все три должны быть из разных сигилов'
  return null
}

// ---------- the scales ----------

export function weigh(game: TotemicGame, left: number[], right: number[]): string {
  const l = left.reduce((sum, id) => sum + weightOf(game, id), 0)
  const r = right.reduce((sum, id) => sum + weightOf(game, id), 0)
  if (l === r) return 'равновесие'
  return l > r ? 'тяжелее левая' : 'тяжелее правая'
}

// ---------- the final challenge ----------

/**
 * Three piles of equal weight, made from a copy of every totem plus your own
 * spirits, with the balloons pulling their side upwards.
 */
export function balanceCheck(
  game: TotemicGame,
  seat: TmPlayer,
  sides: { totems: number[]; balloons: string[] }[],
): { ok: boolean; weights: number[]; problem: string | null } {
  if (sides.length !== 3) return { ok: false, weights: [], problem: 'Сторон должно быть три' }

  const placedTotems = sides.flatMap(side => side.totems)
  const required = [
    ...Array.from({ length: TOTEM_COUNT }, (_, i) => i),
    ...[seat.spirit, ...seat.extraSpirits],
  ]
  const sortedPlaced = [...placedTotems].sort((a, b) => a - b)
  const sortedRequired = [...required].sort((a, b) => a - b)
  if (sortedPlaced.length !== sortedRequired.length
    || sortedPlaced.some((id, i) => id !== sortedRequired[i])) {
    return { ok: false, weights: [], problem: 'На весах должны лежать все тотемы и все ваши духовные' }
  }

  const placedBalloons = sides.flatMap(side => side.balloons)
  if (new Set(placedBalloons).size !== seat.balloons.length
    || seat.balloons.some(b => !placedBalloons.includes(b.id))) {
    return { ok: false, weights: [], problem: 'Все шары тоже должны быть на весах' }
  }

  const weights = sides.map(side =>
    side.totems.reduce((sum, id) => sum + weightOf(game, id), 0)
    - side.balloons.reduce((lift, id) => lift + (seat.balloons.find(b => b.id === id)?.lift ?? 0), 0))

  const ok = weights.every(w => w === weights[0])
  return { ok, weights, problem: ok ? null : 'Стороны весят по-разному' }
}

/** Every rival who names your starting totem knocks three off your score. */
export function scoreFor(game: TotemicGame, player: string, raw: number): number {
  const seat = game.seats[player]
  const caught = game.players.filter(other =>
    other !== player && game.guesses[other]?.[player] === seat.spirit).length
  return raw - caught * GUESS_PENALTY
}

/** Fewest failures first, then the biggest score, then psigems. */
export function ranking(game: TotemicGame, psigems: Record<string, number>): string[] {
  return [...game.players].sort((a, b) =>
    (game.seats[a].failures - game.seats[b].failures)
    || ((game.seats[b].finalScore ?? -Infinity) - (game.seats[a].finalScore ?? -Infinity))
    || ((psigems[b] ?? 0) - (psigems[a] ?? 0)))
}

export function opalWinner(game: TotemicGame): string | null {
  const right = (player: string): number => game.players.filter(other =>
    other !== player && game.guesses[player]?.[other] === game.seats[other].spirit).length
  const best = Math.max(0, ...game.players.map(right))
  if (best === 0) return null
  const leaders = game.players.filter(p => right(p) === best)
  if (leaders.length === 1) return leaders[0]
  const fewest = Math.min(...leaders.map(p => game.seats[p].wagersUsed))
  const byWagers = leaders.filter(p => game.seats[p].wagersUsed === fewest)
  return byWagers.length === 1 ? byWagers[0] : null
}

// ---------- running the match ----------

export type Charge = (player: string, psigems: number) => void

function openRound(game: TotemicGame, series: { a: Series; b: Series }): void {
  game.rounds = [...game.rounds, {
    number: game.rounds.length + 1,
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    series,
    bids: {},
    wagers: {},
    weighings: {},
    report: null,
  }]
}

export function startGame(
  game: TotemicGame,
  players: string[],
  psigems: Record<string, number>,
  series: { a: Series; b: Series },
  hints: Record<string, string>,
): TotemicGame {
  game.players = players
  game.totems = dealTotems()
  const spirits = shuffle(Array.from({ length: TOTEM_COUNT }, (_, i) => i))
  game.seats = Object.fromEntries(players.map((player, i) => [player, {
    chips: START_CHIPS,
    spirit: spirits[i],
    extraSpirits: [],
    trial: [],
    balloons: [],
    wagersUsed: 0,
    snakeUsed: 0,
    notes: [],
    failures: 0,
    finalScore: null,
  }]))
  // ten of the totems nobody started with make up the spare pool
  game.pool = spirits.slice(players.length, players.length + 10)
  game.priority = [...players].sort((a, b) => (psigems[b] ?? 0) - (psigems[a] ?? 0))
  game.hints = hints
  game.snakeTaken = []
  game.owedSpirit = null
  game.guesses = {}
  game.rounds = []
  game.phase = 'auction'
  openRound(game, series)
  log(game, 'setup', `Матч начался. Игроков ${players.length}, у каждого ${START_CHIPS} фишек.`)
  return game
}

function note(game: TotemicGame, player: string, text: string): void {
  game.seats[player].notes = [...game.seats[player].notes, text]
}

/** Settles the auctions, the wagers and whether the endgame has arrived. */
export function closeRound(
  game: TotemicGame, charge: Charge, nextSeries: { a: Series; b: Series } | null,
): TotemicGame {
  const round = currentRound(game)
  if (!round || round.report) return game
  const report: string[] = []

  for (const key of ['a', 'b'] as const) {
    const series = round.series[key]
    const bids: Record<string, TmBid> = {}
    for (const player of game.players) {
      const bid = round.bids[player]?.[key]
      // silence is taken as the smallest legal bid
      bids[player] = bid ?? { amount: MIN_BID, order: [] }
    }
    const { awards, order } = resolveSeries(game, series, bids)
    for (const player of game.players) {
      const spend = Math.min(bids[player].amount, game.seats[player].chips)
      game.seats[player].chips -= spend
    }
    for (const [player, prize] of Object.entries(awards)) {
      if (prize === 'garnet') {
        charge(player, 1)
        report.push(`${series.name}: ${player} берёт псигем`)
      } else {
        game.seats[player].trial = [...game.seats[player].trial, prize]
        report.push(`${series.name}: ${player} берёт тотем ${totemName(game, prize)}`)
      }
    }
    rotatePriority(game, order.filter(p => (bids[p]?.amount ?? 0) > 0))
  }

  // anybody who walked away with nothing gets a spirit totem from the spare pool
  const empty = game.players.filter(p => game.seats[p].trial.length === 0)
  if (empty.length === 1 && game.pool.length > 0) {
    game.owedSpirit = empty[0]
    report.push(`${empty[0]} остался без тотема и выбирает духовный из запаса`)
  } else if (empty.length > 1 && game.pool.length > 0) {
    // several empty handed players all get the same totem, sight unseen
    const pick = game.pool[Math.floor(Math.random() * game.pool.length)]
    game.pool = game.pool.filter(id => id !== pick)
    for (const player of empty) {
      game.seats[player].extraSpirits = [...game.seats[player].extraSpirits, pick]
    }
    report.push(`Без тотема остались ${empty.join(', ')}: всем достался один и тот же духовный тотем`)
  }

  for (const [player, wager] of Object.entries(round.wagers)) {
    const seat = game.seats[player]
    seat.wagersUsed += 1
    if (wager.kind === 'snake') {
      const letters = 'ABCDEFGHIJ'.split('')
      const wanted = wager.letter ?? letters[0]
      let letter = wanted
      let guard = 0
      while (game.snakeTaken.includes(letter) && guard < letters.length) {
        letter = letters[(letters.indexOf(letter) + 1) % letters.length]
        guard += 1
      }
      if (guard >= letters.length) game.snakeTaken = []
      game.snakeTaken = [...game.snakeTaken, letter]
      seat.snakeUsed += 1
      const lift = 11 + Math.floor(Math.random() * 10)
      seat.balloons = [...seat.balloons, {
        id: `${player}-${seat.balloons.length + 1}`, wager: 'snake', lift, known: true,
      }]
      note(game, player, `Змея, подсказка ${letter}: ${game.hints[letter] ?? 'ведущий выдаст отдельно'}. Шар подъёмом ${lift}.`)
    }
    if (wager.kind === 'wolf') {
      const [a, b] = wager.totems
      const lift = 1 + Math.floor(Math.random() * 2)
      seat.balloons = [...seat.balloons, {
        id: `${player}-${seat.balloons.length + 1}`, wager: 'wolf', lift, known: false,
      }]
      note(game, player,
        `Волк: |${totemName(game, a)} − ${totemName(game, b)}| mod 8 = ${wolfResult(game, a, b)}. Шар неизвестного подъёма.`)
    }
    if (wager.kind === 'bear') {
      const cost = BEAR_COST + (wager.fine ? BEAR_FINE_COST : 0)
      charge(player, -cost)
      const total = foxTotal(game, wager.totems)
      note(game, player, `Медведь: суммарный вес в диапазоне ${bearBand(total, !!wager.fine)}.`)
    }
    if (wager.kind === 'fox') {
      const total = foxTotal(game, wager.totems)
      if (wager.fine) {
        charge(player, -FOX_COST)
        note(game, player, `Лис: суммарный вес трёх тотемов ${total}.`)
      } else {
        const lift = 1 + Math.floor(Math.random() * 5)
        seat.balloons = [...seat.balloons, {
          id: `${player}-${seat.balloons.length + 1}`, wager: 'fox', lift, known: false,
        }]
        note(game, player, `Лис: суммарный вес трёх тотемов ${total}. Шар неизвестного подъёма.`)
      }
    }
  }

  // the trial totems crumble at the end of every round
  for (const player of game.players) game.seats[player].trial = []

  round.report = report
  log(game, 'auction', `Раунд ${round.number} разыгран.`)

  const poor = game.players.filter(p => game.seats[p].chips <= CHIP_THRESHOLD).length
  if (poor >= POOR_PLAYERS_TO_END) {
    game.phase = 'final'
    log(game, 'final', 'Три игрока опустились до 15 фишек: начинается Равновесие душ.')
    return game
  }
  if (nextSeries) openRound(game, nextSeries)
  return game
}

/** The lone empty handed player takes their pick out of the spare pool. */
export function claimSpirit(game: TotemicGame, player: string, totem: number): TotemicGame {
  if (game.owedSpirit !== player || !game.pool.includes(totem)) return game
  game.pool = game.pool.filter(id => id !== totem)
  game.seats[player].extraSpirits = [...game.seats[player].extraSpirits, totem]
  game.owedSpirit = null
  log(game, 'auction', `${player} выбрал духовный тотем из запаса.`)
  return game
}

export function attemptBalance(
  game: TotemicGame,
  player: string,
  sides: { totems: number[]; balloons: string[] }[],
): { ok: boolean; problem: string | null } {
  const seat = game.seats[player]
  const result = balanceCheck(game, seat, sides)
  if (!result.ok) {
    seat.failures += 1
    log(game, 'final', `${player} не смог уравнять весы: попытка ${seat.failures}.`)
    return { ok: false, problem: result.problem }
  }
  seat.finalScore = result.weights[0]
  log(game, 'final', `${player} уравнял весы: вес стороны ${result.weights[0]}.`)
  return { ok: true, problem: null }
}

export function finish(game: TotemicGame, psigems: Record<string, number>): TotemicGame {
  for (const player of game.players) {
    const seat = game.seats[player]
    if (seat.finalScore != null) seat.finalScore = scoreFor(game, player, seat.finalScore)
  }
  game.phase = 'finished'
  const order = ranking(game, psigems)
  log(game, 'end', `Итог: ${order.join(' → ')}`)
  return game
}

export interface TmPayout {
  tol: Record<string, number>
  opals: Record<string, number>
  winner: string | null
  ec: string | null
}

export function payoutFor(game: TotemicGame, psigems: Record<string, number>): TmPayout {
  const order = ranking(game, psigems)
  const winner = order[0] ?? null
  const ec = order[order.length - 1] ?? null
  const tol: Record<string, number> = {}
  const opals: Record<string, number> = {}
  if (winner) {
    tol[winner] = 2
    opals[winner] = 1
  }
  const challenge = opalWinner(game)
  if (challenge && challenge !== winner) opals[challenge] = (opals[challenge] ?? 0) + 1
  return { tol, opals, winner, ec }
}

// ---------- what a viewer sees ----------

export interface TmView {
  id: string
  name: string
  phase: TmPhase
  players: string[]
  roundNumber: number
  deadline: string | null
  grid: { id: number; season: Season; sigil: Sigil; weight: number | null }[]
  myChips: number
  mySpirit: { id: number; name: string; weight: number } | null
  myExtras: number[]
  myTrial: number[]
  myBalloons: { id: string; wager: Wager; lift: number | null }[]
  poolChoice: number[]
  myNotes: string[]
  myWeighings: { left: number[]; right: number[]; result: string }[]
  weighingsLeft: number
  series: { a: Series; b: Series } | null
  chips: Record<string, number>
  priority: string[]
  lastReport: string[]
  amPlaying: boolean
  failures: number
  finalScore: number | null
  ranking: string[] | null
  log: TmLogEntry[]
}

export function viewFor(game: TotemicGame, username: string, isAdmin: boolean): TmView {
  const round = currentRound(game)
  const seat = game.seats[username] ?? null
  const previous = [...game.rounds].reverse().find(r => r.report) ?? null
  const over = game.phase === 'finished'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    roundNumber: round?.number ?? 0,
    deadline: round && !round.report ? round.deadline : null,
    grid: game.totems.map(totem => ({
      id: totem.id,
      season: totem.season,
      sigil: totem.sigil,
      // a weight is yours to know only for your own starting totem
      weight: over || isAdmin || (seat && totem.id === seat.spirit) ? totem.weight : null,
    })),
    myChips: seat?.chips ?? 0,
    mySpirit: seat ? {
      id: seat.spirit,
      name: totemName(game, seat.spirit),
      weight: weightOf(game, seat.spirit),
    } : null,
    myExtras: seat?.extraSpirits ?? [],
    myTrial: seat?.trial ?? [],
    myBalloons: (seat?.balloons ?? []).map(b => ({
      id: b.id, wager: b.wager, lift: b.known ? b.lift : null,
    })),
    poolChoice: game.owedSpirit === username ? game.pool : [],
    myNotes: seat?.notes ?? [],
    myWeighings: round?.weighings[username] ?? [],
    weighingsLeft: SCALE_USES - (round?.weighings[username]?.length ?? 0),
    series: round?.series ?? null,
    chips: Object.fromEntries(game.players.map(p => [p, game.seats[p]?.chips ?? 0])),
    priority: game.priority,
    lastReport: previous?.report ?? [],
    amPlaying: game.players.includes(username),
    failures: seat?.failures ?? 0,
    finalScore: seat?.finalScore ?? null,
    ranking: over || isAdmin ? ranking(game, {}) : null,
    log: game.log,
  }
}
