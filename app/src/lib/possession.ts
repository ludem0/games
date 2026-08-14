import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Five Fold Possession: five players, twelve rounds, five minigames a round and
// one of them quietly working through a list of tasks without being spotted.

const PATH = join(process.cwd(), 'possession.json')

export const ROUNDS = 12
export const ROUND_MS = 24 * 60 * 60 * 1000
export const CARDS = Array.from({ length: 12 }, (_, i) => i + 1)
export const MAX_BID = 10
export const MIN_BET = 1
export const MAX_BET = 5
export const GREED_FEE = 1
export const CHALLENGE_POINT = 0.5

export type Stone = 'grey' | 'white' | 'black' | 'green' | 'red'

/** The bag, exactly as the dice command spells it out. */
export const BAG: Stone[] = [
  'grey', 'grey', 'grey',
  'white', 'white', 'white', 'white', 'white',
  'black', 'black', 'black', 'black',
  'green',
  'red', 'red',
]

export const STONE_TEXT: Record<Stone, string> = {
  grey: 'ничего не происходит',
  white: 'плюс псигем',
  black: 'минус псигем',
  green: 'плюс очко',
  red: 'добыча останавливается, минус псигем за каждого, кто тоже вытянул красный',
}

export type Role = 'possessed' | 'hunter' | 'player'
export type FfpPhase = 'setup' | 'live' | 'finished'

export interface RoleAssignment {
  possessed: string | null
  hunter: string | null
}

export interface RpsEntry { opponent: string; bet: number; throw: 'rock' | 'paper' | 'scissors' }

export interface FfpSubmission {
  rps?: RpsEntry
  card?: number
  /** stones drawn this round, in order, plus which one the possessed ignored */
  stones?: Stone[]
  ignored?: number
  bid?: number
  /** the guess about the round before: label to player */
  identities?: Record<string, string>
  guess?: { possessed: string; hunter: string }
  /** the opal shot at the round with nobody possessed */
  emptyRound?: number
}

export interface FfpRound {
  number: number
  deadline: string
  roles: RoleAssignment
  /** the anonymous name each player wears this round */
  labels: Record<string, string>
  submissions: Record<string, FfpSubmission>
  report: string[] | null
  challenges: string[]
  detected: boolean
}

export interface FfpLogEntry {
  at: string
  text: string
  kind: 'setup' | 'round' | 'result' | 'end'
}

export interface PossessionGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: FfpPhase
  players: string[]
  points: Record<string, number>
  /** points that came from the minigames rather than from possession */
  minigamePoints: Record<string, number>
  hands: Record<string, number[]>
  startingPsigems: Record<string, number>
  /** how often each player named the possessed and the hunter correctly */
  correctRoles: Record<string, number>
  correctIdentities: Record<string, number>
  challengesDone: Record<string, number>
  /** the last two opponents each player faced at rock paper scissors */
  recentRps: Record<string, string[]>
  missedRps: Record<string, number>
  rounds: FfpRound[]
  /** the roles for rounds two onwards, settled before the first deadline */
  deal: RoleAssignment[]
  emptyRound: number
  paidOut?: boolean
  log: FfpLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, PossessionGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, PossessionGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): PossessionGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: PossessionGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): PossessionGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: PossessionGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup', players: [],
    points: {}, minigamePoints: {}, hands: {}, startingPsigems: {},
    correctRoles: {}, correctIdentities: {}, challengesDone: {},
    recentRps: {}, missedRps: {},
    rounds: [], deal: [], emptyRound: 0,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: PossessionGame): PossessionGame {
  return {
    ...game,
    phase: 'setup', players: [],
    points: {}, minigamePoints: {}, hands: {}, startingPsigems: {},
    correctRoles: {}, correctIdentities: {}, challengesDone: {},
    recentRps: {}, missedRps: {}, rounds: [], deal: [], emptyRound: 0,
    paidOut: false, log: [],
  }
}

function log(game: PossessionGame, kind: FfpLogEntry['kind'], text: string): void {
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

export function currentRound(game: PossessionGame): FfpRound | null {
  return game.rounds[game.rounds.length - 1] ?? null
}

// ---------- handing out the roles ----------

const LABELS = ['Альфа', 'Бета', 'Гамма', 'Дельта', 'Эпсилон', 'Дзета', 'Эта', 'Тета']

/**
 * Twelve rounds of roles at once, so the constraints can all be checked: two
 * turns each, never twice running, never both roles at once, and never the
 * same pair twice. One round from two onwards has nobody possessed.
 */
export function dealRoles(players: string[], attempts = 4000): { roles: RoleAssignment[]; empty: number } {
  const rounds = ROUNDS - 1                 // round one has no roles at all
  for (let attempt = 0; attempt < attempts; attempt++) {
    const empty = 2 + Math.floor(Math.random() * rounds)
    const possessedSlots = shuffle(players.flatMap(p => [p, p]))
    const hunterSlots = shuffle(players.flatMap(p => [p, p]))
    const roles: RoleAssignment[] = []
    const pairs = new Set<string>()
    let ok = true
    let pi = 0
    let hi = 0

    for (let round = 2; round <= ROUNDS; round++) {
      if (round === empty) {
        roles.push({ possessed: null, hunter: null })
        continue
      }
      const possessed = possessedSlots[pi]
      const hunter = hunterSlots[hi]
      const previous = roles[roles.length - 1]
      if (!possessed || !hunter || possessed === hunter
        || previous?.possessed === possessed || previous?.hunter === hunter
        || pairs.has(`${possessed}|${hunter}`)) {
        ok = false
        break
      }
      pairs.add(`${possessed}|${hunter}`)
      roles.push({ possessed, hunter })
      pi += 1
      hi += 1
    }
    if (ok && roles.length === rounds) return { roles, empty }
  }
  // a clean deal is not always reachable, so fall back to something legal enough
  return {
    roles: Array.from({ length: rounds }, () => ({ possessed: null, hunter: null })),
    empty: 2,
  }
}

// ---------- the minigames ----------

/** The median ignores any number more than one player picked. */
export function medianWinner(cards: Record<string, number>): { median: number | null; winners: string[] } {
  const counts = new Map<number, number>()
  for (const value of Object.values(cards)) counts.set(value, (counts.get(value) ?? 0) + 1)
  const usable = Object.entries(cards).filter(([, value]) => counts.get(value) === 1)
  if (usable.length === 0) return { median: null, winners: [] }

  const values = usable.map(([, value]) => value).sort((a, b) => a - b)
  const median = values[Math.floor((values.length - 1) / 2)]
  const exact = values.length % 2 === 1 ? median : null
  if (exact == null) return { median: null, winners: [] }
  return { median: exact, winners: usable.filter(([, value]) => value === exact).map(([player]) => player) }
}

/** The highest bid nobody matched takes the point. */
export function bidWinner(bids: Record<string, number>): { winner: string | null; amount: number } {
  const counts = new Map<number, number>()
  for (const value of Object.values(bids)) counts.set(value, (counts.get(value) ?? 0) + 1)
  const unique = Object.entries(bids).filter(([, value]) => counts.get(value) === 1)
  if (unique.length === 0) return { winner: null, amount: 0 }
  const best = Math.max(...unique.map(([, value]) => value))
  const winner = unique.find(([, value]) => value === best)!
  return { winner: winner[0], amount: best }
}

export function rpsBeats(mine: RpsEntry['throw'], theirs: RpsEntry['throw']): number {
  if (mine === theirs) return 0
  const beats: Record<RpsEntry['throw'], RpsEntry['throw']> = {
    rock: 'scissors', paper: 'rock', scissors: 'paper',
  }
  return beats[mine] === theirs ? 1 : -1
}

/** Draws a stone from what is left of the bag. */
export function drawStone(drawn: Stone[]): Stone {
  const left = [...BAG]
  for (const stone of drawn) {
    const index = left.indexOf(stone)
    if (index >= 0) left.splice(index, 1)
  }
  return left[Math.floor(Math.random() * left.length)] ?? 'grey'
}

const PRIMES = [2, 3, 5, 7, 11]

/** Which of the ten tasks the possessed managed this round. */
export function challengesFor(
  round: FfpRound,
  players: string[],
  results: {
    rpsDrew: string[]
    rpsPlayed: string[]
    medianWinners: string[]
    bidWinner: string | null
    bidAmount: number
    blockedTop: string[]
    greedNet: Record<string, number>
    identityPerfect: string[]
  },
): string[] {
  const possessed = round.roles.possessed
  if (!possessed) return []
  const done: string[] = []
  const mine = round.submissions[possessed] ?? {}

  if (results.rpsDrew.includes(possessed)) done.push('Ничья в RPS')
  if (players.filter(p => !results.rpsPlayed.includes(p)).length >= 3) done.push('Трое не сыграли в RPS')
  if (mine.card != null && PRIMES.includes(mine.card)) done.push('Простое число в «Медиане»')
  if (results.medianWinners.includes(possessed) || results.medianWinners.length === 0) {
    done.push('Медиана взята или не взята никем')
  }
  const stones = mine.stones ?? []
  if (stones.filter(s => s === 'grey').length === 3) done.push('Все три серых камня')
  if ((results.greedNet[possessed] ?? 0) > 0) done.push('Плюс по псигемам в «Жадности»')
  if (results.blockedTop.includes(possessed)) done.push('Заблокирована высшая ставка')
  if (results.bidWinner === possessed && results.bidAmount <= 1) done.push('Победа в торгах ставкой 0 или 1')
  if (results.identityPerfect.includes(possessed)) done.push('Угаданы все личности')
  if (results.identityPerfect.length < players.length) done.push('Кто-то ошибся в личностях')
  return done
}

// ---------- the round ----------

export type Charge = (player: string, psigems: number) => void

function openRound(game: PossessionGame): void {
  const number = game.rounds.length + 1
  // round one carries no roles at all; the rest come from the deal
  const roles = number === 1
    ? { possessed: null, hunter: null }
    : game.deal[number - 2] ?? { possessed: null, hunter: null }
  const names = shuffle(LABELS).slice(0, game.players.length)

  game.rounds = [...game.rounds, {
    number,
    deadline: new Date(Date.now() + ROUND_MS).toISOString(),
    roles,
    labels: Object.fromEntries(game.players.map((p, i) => [p, names[i]])),
    submissions: {},
    report: null,
    challenges: [],
    detected: false,
  }]
}

export function startGame(
  game: PossessionGame, players: string[], psigems: Record<string, number>,
): PossessionGame {
  const { roles, empty } = dealRoles(players)
  game.players = players
  game.points = Object.fromEntries(players.map(p => [p, 0]))
  game.minigamePoints = Object.fromEntries(players.map(p => [p, 0]))
  game.hands = Object.fromEntries(players.map(p => [p, [...CARDS]]))
  game.startingPsigems = Object.fromEntries(players.map(p => [p, psigems[p] ?? 0]))
  game.correctRoles = Object.fromEntries(players.map(p => [p, 0]))
  game.correctIdentities = Object.fromEntries(players.map(p => [p, 0]))
  game.challengesDone = Object.fromEntries(players.map(p => [p, 0]))
  game.recentRps = Object.fromEntries(players.map(p => [p, []]))
  game.missedRps = Object.fromEntries(players.map(p => [p, 0]))
  game.deal = roles
  game.emptyRound = empty
  game.phase = 'live'
  game.rounds = []
  game.log = []
  openRound(game)
  log(game, 'setup', `Матч начался. Игроков ${players.length}, раундов ${ROUNDS}.`)
  return game
}

function award(game: PossessionGame, player: string, points: number, fromMinigame: boolean): void {
  game.points = { ...game.points, [player]: (game.points[player] ?? 0) + points }
  if (fromMinigame) {
    game.minigamePoints = { ...game.minigamePoints, [player]: (game.minigamePoints[player] ?? 0) + points }
  }
}

/**
 * Settles a round: the four live minigames, then the guessing from the round
 * before, then whatever the possessed managed to slip past everybody.
 */
export function closeRound(game: PossessionGame, charge: Charge): PossessionGame {
  const round = currentRound(game)
  if (!round || round.report) return game
  const report: string[] = []
  const label = (player: string): string => round.labels[player] ?? player

  // ---- rock paper scissors ----
  const played = new Set<string>()
  const drew: string[] = []
  for (const player of game.players) {
    const mine = round.submissions[player]?.rps
    if (!mine) continue
    const theirs = round.submissions[mine.opponent]?.rps
    if (!theirs || theirs.opponent !== player) continue
    if (played.has(player) || played.has(mine.opponent)) continue

    const stake = Math.min(mine.bet, theirs.bet)
    const result = rpsBeats(mine.throw, theirs.throw)
    played.add(player)
    played.add(mine.opponent)
    game.recentRps = {
      ...game.recentRps,
      [player]: [mine.opponent, ...(game.recentRps[player] ?? [])].slice(0, 2),
      [mine.opponent]: [player, ...(game.recentRps[mine.opponent] ?? [])].slice(0, 2),
    }
    if (result === 0) {
      drew.push(player, mine.opponent)
      report.push(`${label(player)} и ${label(mine.opponent)}: ничья в RPS`)
    } else {
      const winner = result > 0 ? player : mine.opponent
      const loser = result > 0 ? mine.opponent : player
      charge(winner, stake)
      charge(loser, -stake)
      report.push(`${label(winner)} выиграл ${stake} у ${label(loser)}`)
    }
  }
  for (const player of game.players) {
    if (played.has(player)) {
      game.missedRps = { ...game.missedRps, [player]: 0 }
      continue
    }
    const missed = (game.missedRps[player] ?? 0) + 1
    game.missedRps = { ...game.missedRps, [player]: missed }
    if (missed >= 2) {
      charge(player, -1)
      game.missedRps = { ...game.missedRps, [player]: 0 }
    }
  }

  // ---- the median ----
  const cards: Record<string, number> = {}
  for (const player of game.players) {
    const hand = game.hands[player] ?? []
    const pick = round.submissions[player]?.card
    if (pick != null && hand.includes(pick)) {
      cards[player] = pick
    } else {
      const lowest = Math.min(...hand)
      cards[player] = lowest
      charge(player, -1)
      report.push(`${label(player)} не сдал карту и сыграл ${lowest}`)
    }
    game.hands = { ...game.hands, [player]: hand.filter(c => c !== cards[player]) }
  }
  const median = medianWinner(cards)
  for (const player of game.players) report.push(`${label(player)} сыграл ${cards[player]}`)
  for (const winner of median.winners) {
    award(game, winner, 1, true)
    charge(winner, 1)
    report.push(`Медиана ${median.median}: очко берёт ${label(winner)}`)
  }
  if (median.winners.length === 0) report.push('Медиану не взял никто')

  // ---- does greed succeed ----
  const greedNet: Record<string, number> = {}
  const reds: string[] = []
  const participants = game.players.filter(p => (round.submissions[p]?.stones ?? []).length > 0)
  for (const player of participants) {
    const mine = round.submissions[player]!
    const stones = mine.stones ?? []
    const ignored = round.roles.possessed === player ? mine.ignored : undefined
    let net = -GREED_FEE
    charge(player, -GREED_FEE)
    stones.forEach((stone, index) => {
      // a red stone still gives the possessed away, ignored or not
      if (stone === 'red') reds.push(player)
      if (index === ignored) return
      if (stone === 'white') { charge(player, 1); net += 1 }
      if (stone === 'black') { charge(player, -1); net -= 1 }
      if (stone === 'green') award(game, player, 1, true)
    })
    greedNet[player] = net
  }
  for (const player of reds) {
    charge(player, -reds.length)
    greedNet[player] = (greedNet[player] ?? 0) - reds.length
  }
  report.push(`В «Жадности» играли ${participants.length} чел.` +
    (reds.length > 0 ? ` Красный камень вытянули: ${[...new Set(reds)].map(label).join(', ')}` : ''))

  // ---- bidding war ----
  const bids: Record<string, number> = {}
  for (const player of game.players) bids[player] = round.submissions[player]?.bid ?? 0
  const bid = bidWinner(bids)
  const topBid = Math.max(...Object.values(bids))
  const blockedTop = Object.entries(bids)
    .filter(([, value]) => value === topBid && Object.values(bids).filter(v => v === topBid).length > 1)
    .map(([player]) => player)
  if (bid.winner) {
    award(game, bid.winner, 1, true)
    charge(bid.winner, -bid.amount)
    report.push(`Торги: ставки ${Object.values(bids).sort((a, b) => b - a).join(', ')}. Побеждает ${label(bid.winner)}`)
  } else {
    report.push('Торги: все ставки заблокированы, очко не ушло никому')
  }

  // ---- guessing the round before ----
  const previous = game.rounds[game.rounds.length - 2] ?? null
  const identityPerfect: string[] = []
  if (previous) {
    for (const player of game.players) {
      const guess = round.submissions[player]?.identities ?? {}
      const right = game.players.every(target => guess[previous.labels[target]] === target)
      if (right) {
        identityPerfect.push(player)
        game.correctIdentities = {
          ...game.correctIdentities,
          [player]: (game.correctIdentities[player] ?? 0) + 1,
        }
      }
      const roleGuess = round.submissions[player]?.guess
      if (roleGuess && previous.roles.possessed
        && roleGuess.possessed === previous.roles.possessed
        && roleGuess.hunter === previous.roles.hunter) {
        game.correctRoles = { ...game.correctRoles, [player]: (game.correctRoles[player] ?? 0) + 1 }
      }
    }
    for (const player of identityPerfect) charge(player, 1)
    if (identityPerfect.length === 1) award(game, identityPerfect[0], 1, true)
    report.push(`Все пять личностей угадали: ${identityPerfect.length} чел.`)

    // four fingers pointing the right way turn the possession score upside down
    const caught = game.players.filter(p =>
      round.submissions[p]?.guess?.possessed === previous.roles.possessed).length
    previous.detected = caught >= 4
    if (previous.roles.possessed) {
      const value = previous.detected ? -CHALLENGE_POINT : CHALLENGE_POINT
      award(game, previous.roles.possessed, previous.challenges.length * value, false)
    }
  }

  // ---- what the possessed pulled off ----
  round.challenges = challengesFor(round, game.players, {
    rpsDrew: drew,
    rpsPlayed: [...played],
    medianWinners: median.winners,
    bidWinner: bid.winner,
    bidAmount: bid.amount,
    blockedTop,
    greedNet,
    identityPerfect,
  })
  if (round.roles.possessed) {
    game.challengesDone = {
      ...game.challengesDone,
      [round.roles.possessed]: (game.challengesDone[round.roles.possessed] ?? 0) + round.challenges.length,
    }
  }

  round.report = report
  log(game, 'result', `Раунд ${round.number} подсчитан.`)

  if (game.rounds.length >= ROUNDS) return finish(game)
  openRound(game)
  return game
}

export function finish(game: PossessionGame): PossessionGame {
  game.phase = 'finished'
  log(game, 'end', 'Матч окончен, роли и очки раскрыты.')
  return game
}

/** Most points, then minigame points, then psigems, then the starting pile. */
export function pointsWinner(game: PossessionGame, psigems: Record<string, number>): string | null {
  const ranked = [...game.players].sort((a, b) =>
    (game.points[b] ?? 0) - (game.points[a] ?? 0)
    || (game.minigamePoints[b] ?? 0) - (game.minigamePoints[a] ?? 0)
    || (psigems[b] ?? 0) - (psigems[a] ?? 0)
    || (game.startingPsigems[b] ?? 0) - (game.startingPsigems[a] ?? 0))
  return ranked[0] ?? null
}

/** Most correct role calls, then identities, then challenges, then psigems. */
export function detectiveWinner(game: PossessionGame, psigems: Record<string, number>): string | null {
  const ranked = [...game.players].sort((a, b) =>
    (game.correctRoles[b] ?? 0) - (game.correctRoles[a] ?? 0)
    || (game.correctIdentities[b] ?? 0) - (game.correctIdentities[a] ?? 0)
    || (game.challengesDone[b] ?? 0) - (game.challengesDone[a] ?? 0)
    || (psigems[b] ?? 0) - (psigems[a] ?? 0)
    || (game.startingPsigems[b] ?? 0) - (game.startingPsigems[a] ?? 0))
  return ranked[0] ?? null
}

export interface FfpPayout {
  tol: Record<string, number>
  opals: Record<string, number>
  winners: string[]
  ec: string | null
}

export function payoutFor(game: PossessionGame, psigems: Record<string, number>): FfpPayout {
  const tol: Record<string, number> = {}
  const opals: Record<string, number> = {}
  const byPoints = pointsWinner(game, psigems)
  const byDetection = detectiveWinner(game, psigems)
  const winners = [...new Set([byPoints, byDetection].filter((p): p is string => !!p))]

  if (byPoints && byPoints === byDetection) {
    tol[byPoints] = 2
    opals[byPoints] = 1
  } else {
    for (const player of winners) tol[player] = 1
  }

  const losers = game.players.filter(p => !winners.includes(p))
  const ec = losers.length > 0
    ? losers.reduce((worst, p) => ((game.points[p] ?? 0) < (game.points[worst] ?? 0) ? p : worst), losers[0])
    : null
  return { tol, opals, winners, ec }
}

export function applyClock(game: PossessionGame, charge: Charge, now = Date.now()): PossessionGame {
  if (game.phase !== 'live') return game
  const round = currentRound(game)
  if (!round || round.report || now < new Date(round.deadline).getTime()) return game
  return closeRound(game, charge)
}

// ---------- what a viewer sees ----------

export interface FfpView {
  id: string
  name: string
  phase: FfpPhase
  players: string[]
  roundNumber: number
  deadline: string | null
  myRole: Role | null
  myHand: number[]
  mySubmission: FfpSubmission | null
  myStones: Stone[]
  /** the labels worn last round, which is what the guessing is about */
  previousLabels: string[]
  lastReport: string[]
  amPlaying: boolean
  challengesLastRound: number
  winner: string[]
  reveal: { round: number; possessed: string | null; hunter: string | null; challenges: number }[] | null
  points: Record<string, number> | null
  log: FfpLogEntry[]
}

export function viewFor(game: PossessionGame, username: string, isAdmin: boolean): FfpView {
  const round = currentRound(game)
  const previous = game.rounds[game.rounds.length - 2] ?? null
  const over = game.phase === 'finished'

  const role: Role | null = !round ? null
    : round.roles.possessed === username ? 'possessed'
      : round.roles.hunter === username ? 'hunter'
        : game.players.includes(username) ? 'player' : null

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    roundNumber: round?.number ?? 0,
    deadline: round && !round.report ? round.deadline : null,
    myRole: role,
    myHand: game.hands[username] ?? [],
    mySubmission: round?.submissions[username] ?? null,
    myStones: round?.submissions[username]?.stones ?? [],
    previousLabels: previous ? Object.values(previous.labels) : [],
    lastReport: previous?.report ?? [],
    amPlaying: game.players.includes(username),
    challengesLastRound: previous?.challenges.length ?? 0,
    winner: over ? payoutFor(game, {}).winners : [],
    reveal: over || isAdmin
      ? game.rounds.map(r => ({
        round: r.number,
        possessed: r.roles.possessed,
        hunter: r.roles.hunter,
        challenges: r.challenges.length,
      }))
      : null,
    points: over || isAdmin ? game.points : null,
    log: isAdmin || over ? game.log : [],
  }
}
