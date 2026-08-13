import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// King's Court: a hidden role main match. One king, and two even teams trying to
// pack the court with their own people before the king is voted in.

const PATH = join(process.cwd(), 'kingscourt.json')

export const ROUND_MS = 24 * 60 * 60 * 1000   // a voting round lasts a day
export const MAX_ATTEMPTS = 4                 // four early ends and the match is over
export const PEEK_COST = 8                    // psigems to learn somebody's role
export const ANNOYED_COST = 3                 // psigems to learn whether you are annoyed
export const NO_VOTE_PENALTY = 1
export const EARLY_KING_PENALTY = 2
/** the king has to be the fourth person in or later, otherwise the game restarts */
export const SAFE_COURT_SIZE = 3

export type KcRole = 'king' | 'duke' | 'noble'
export type KcTeam = 'king' | 'dukes' | 'nobles'
export type KcPhase = 'setup' | 'live' | 'tiebreak' | 'payout' | 'finished'
export type CheckResult = 'same' | 'different'

export interface KcSeat {
  role: KcRole
  /** the judge lies about this player in every check */
  annoyed: boolean
  /** the three names this player is fed as the court fills up */
  hints: string[]
}

export interface KcRound {
  number: number
  openedAt: string
  deadline: string
  votes: Record<string, string>
  tally: Record<string, number> | null
  elected: string | null
  tiedAmong: string[]
  /** the check the person elected last round owes the judge */
  checkBy: string | null
  checkPair: string[] | null
  checkResult: CheckResult | null
  closedAt: string | null
}

export interface KcAttempt {
  number: number
  seats: Record<string, KcSeat>
  king: string
  /** the two players the king looked at before the first election */
  kingPeeks: string[]
  court: string[]
  rounds: KcRound[]
  totalVotes: Record<string, number>
  winner: KcTeam | null
  earlyEnd: boolean
  /** set once the rewards have been written into the season */
  paidOut?: boolean
  finishedAt: string | null
}

/** How a game charges or pays a player, handed in by the caller. */
export type Charge = (player: string, amount: number) => void

export interface KcLogEntry {
  at: string
  text: string
  kind: 'setup' | 'vote' | 'court' | 'judge' | 'game' | 'end'
}

export interface KingsCourtGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: KcPhase
  attempts: KcAttempt[]
  /** nobody wears the crown twice */
  formerKings: string[]
  ec: string | null
  /** what each player privately learned, newest last */
  notes: Record<string, string[]>
  log: KcLogEntry[]
  createdAt: string
}

function readAll(): Record<string, KingsCourtGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, KingsCourtGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): KingsCourtGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: KingsCourtGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): KingsCourtGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: KingsCourtGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup', attempts: [], formerKings: [], ec: null,
    notes: {}, log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: KingsCourtGame): KingsCourtGame {
  return { ...game, phase: 'setup', attempts: [], formerKings: [], ec: null, notes: {}, log: [] }
}

/**
 * Trading is frozen from the moment the king is in the court until the
 * elimination candidate is settled.
 */
export function isTradeFrozen(seasonSlug: string): boolean {
  return Object.values(readAll()).some(game =>
    game.seasonSlug === seasonSlug && game.phase === 'payout' && !game.ec)
}

// ---------- helpers ----------

export function currentAttempt(game: KingsCourtGame): KcAttempt | null {
  return game.attempts[game.attempts.length - 1] ?? null
}

export function currentRound(attempt: KcAttempt | null): KcRound | null {
  return attempt?.rounds[attempt.rounds.length - 1] ?? null
}

function log(game: KingsCourtGame, kind: KcLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

function note(game: KingsCourtGame, player: string, text: string): void {
  game.notes = { ...game.notes, [player]: [...(game.notes[player] ?? []), text] }
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

export function players(attempt: KcAttempt): string[] {
  return Object.keys(attempt.seats)
}

export function teamOf(role: KcRole): KcTeam {
  return role === 'king' ? 'king' : role === 'duke' ? 'dukes' : 'nobles'
}

export function membersOf(attempt: KcAttempt, role: KcRole): string[] {
  return players(attempt).filter(p => attempt.seats[p].role === role)
}

/** Everyone who still has a vote: outside the court, and still in the game. */
export function voters(attempt: KcAttempt): string[] {
  return players(attempt).filter(p => !attempt.court.includes(p))
}

// ---------- dealing a game ----------

function dealSeats(roster: string[], formerKings: string[]): Record<string, KcSeat> {
  const kingPool = roster.filter(p => !formerKings.includes(p))
  const king = shuffle(kingPool.length > 0 ? kingPool : roster)[0]
  const rest = shuffle(roster.filter(p => p !== king))
  const dukeCount = Math.floor(rest.length / 2)
  const dukes = rest.slice(0, dukeCount)
  const nobles = rest.slice(dukeCount)

  // one duke and one noble have annoyed the judge, and he lies about them
  const annoyed = new Set([shuffle(dukes)[0], shuffle(nobles)[0]].filter(Boolean))

  const seats: Record<string, KcSeat> = {}
  for (const player of roster) {
    const role: KcRole = player === king ? 'king' : dukes.includes(player) ? 'duke' : 'noble'
    seats[player] = { role, annoyed: annoyed.has(player), hints: [] }
  }

  // every player is fed three names: a duke, a noble, and one at random
  for (const player of roster) {
    const duke = shuffle(dukes.filter(p => p !== player))[0]
    const noble = shuffle(nobles.filter(p => p !== player))[0]
    const random = shuffle(roster.filter(p => p !== player && p !== duke && p !== noble))[0]
    seats[player].hints = shuffle([duke, noble, random].filter(Boolean))
  }
  return seats
}

function openRound(game: KingsCourtGame, attempt: KcAttempt): void {
  const now = Date.now()
  attempt.rounds = [...attempt.rounds, {
    number: attempt.rounds.length + 1,
    openedAt: new Date(now).toISOString(),
    deadline: new Date(now + ROUND_MS).toISOString(),
    votes: {},
    tally: null,
    elected: null,
    tiedAmong: [],
    // the person elected last round owes the judge a pair, due at this deadline
    checkBy: attempt.court[attempt.court.length - 1] ?? null,
    checkPair: null,
    checkResult: null,
    closedAt: null,
  }]
}

export function startAttempt(game: KingsCourtGame, roster: string[]): KingsCourtGame {
  const number = game.attempts.length + 1
  const seats = dealSeats(roster, game.formerKings)
  const king = roster.find(p => seats[p].role === 'king') ?? roster[0]
  const attempt: KcAttempt = {
    number, seats, king,
    kingPeeks: [],
    court: [],
    rounds: [],
    totalVotes: Object.fromEntries(roster.map(p => [p, 0])),
    winner: null,
    earlyEnd: false,
    finishedAt: null,
  }
  game.attempts = [...game.attempts, attempt]
  game.phase = 'live'
  openRound(game, attempt)
  log(game, 'game', `Игра ${number} началась. Роли розданы заново.`)
  return game
}

// ---------- the judge ----------

/**
 * The judge answers whether two players share a team, and lies once for every
 * annoyed player in the pair.
 */
export function judgeCheck(attempt: KcAttempt, a: string, b: string): CheckResult {
  const left = attempt.seats[a]
  const right = attempt.seats[b]
  const same = teamOf(left.role) === teamOf(right.role)
  const lies = (left.annoyed ? 1 : 0) + (right.annoyed ? 1 : 0)
  const flipped = lies % 2 === 1 ? !same : same
  return flipped ? 'same' : 'different'
}

/** Hints land as the second, fourth and sixth person joins the court. */
function deliverHint(game: KingsCourtGame, attempt: KcAttempt): void {
  const size = attempt.court.length
  if (size !== 2 && size !== 4 && size !== 6) return
  const index = size / 2 - 1
  for (const player of players(attempt)) {
    const name = attempt.seats[player].hints[index]
    if (name) note(game, player, `Судья называет имя: ${name}`)
  }
  log(game, 'judge', `Судья раздал ${index + 1}-е имя всем игрокам.`)
}

// ---------- ending a game ----------

function finishAttempt(game: KingsCourtGame, attempt: KcAttempt): KingsCourtGame {
  const dukes = attempt.court.filter(p => attempt.seats[p].role === 'duke').length
  const nobles = attempt.court.filter(p => attempt.seats[p].role === 'noble').length
  attempt.winner = dukes === nobles ? 'king' : dukes > nobles ? 'dukes' : 'nobles'
  attempt.finishedAt = new Date().toISOString()
  game.phase = 'payout'
  log(game, 'end',
    `Король ${attempt.king} избран. В суде герцогов ${dukes}, дворян ${nobles}. ` +
    `Победа: ${attempt.winner === 'king' ? 'король' : attempt.winner === 'dukes' ? 'герцоги' : 'дворяне'}.`)
  return game
}

/** The king was found too early: the whole thing restarts with new roles. */
function restart(game: KingsCourtGame, attempt: KcAttempt, charge: Charge): KingsCourtGame {
  attempt.earlyEnd = true
  attempt.finishedAt = new Date().toISOString()
  game.formerKings = [...game.formerKings, attempt.king]
  charge(attempt.king, EARLY_KING_PENALTY)
  log(game, 'end',
    `Король ${attempt.king} избран слишком рано (в суде было ${attempt.court.length - 1}). ` +
    'Игра переигрывается, роли раздаются заново.')
  if (game.attempts.length >= MAX_ATTEMPTS) {
    game.phase = 'finished'
    log(game, 'end', `Четыре ранних конца. Матч закончен, в дэтматч идут короли: ${game.formerKings.join(', ')}.`)
  }
  return game
}

function elect(game: KingsCourtGame, attempt: KcAttempt, player: string, charge: Charge): KingsCourtGame {
  attempt.court = [...attempt.court, player]
  const isKing = player === attempt.king
  log(game, 'court', `${player} входит в суд и оказывается ${isKing ? 'КОРОЛЁМ' : 'не королём'}.`)

  if (isKing) {
    return attempt.court.length - 1 < SAFE_COURT_SIZE
      ? restart(game, attempt, charge)
      : finishAttempt(game, attempt)
  }

  deliverHint(game, attempt)

  // only the king left outside means he is in by default
  const outside = voters(attempt)
  if (outside.length === 1 && outside[0] === attempt.king) {
    return elect(game, attempt, attempt.king, charge)
  }

  openRound(game, attempt)
  return game
}

// ---------- closing a round ----------

function tallyOf(round: KcRound): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const target of Object.values(round.votes)) {
    tally[target] = (tally[target] ?? 0) + 1
  }
  return tally
}

/**
 * Everything a closed round owes: penalties for silence, the judge's answer,
 * the tally, and whoever that puts in the court.
 */
export function closeRound(game: KingsCourtGame, charge: Charge): KingsCourtGame {
  const attempt = currentAttempt(game)
  const round = currentRound(attempt)
  if (!attempt || !round || round.closedAt) return game

  for (const voter of voters(attempt)) {
    if (round.votes[voter]) continue
    charge(voter, NO_VOTE_PENALTY)
    log(game, 'vote', `${voter} не проголосовал и теряет ${NO_VOTE_PENALTY} псигем.`)
  }

  // the judge answers the pair handed in during this round
  if (round.checkBy && round.checkPair) {
    const [a, b] = round.checkPair
    round.checkResult = judgeCheck(attempt, a, b)
    note(game, round.checkBy,
      `Судья: ${a} и ${b} ${round.checkResult === 'same' ? 'в одной команде' : 'в разных командах'}.`)
    log(game, 'judge', `${round.checkBy} получил ответ судьи.`)
  }

  const tally = tallyOf(round)
  round.tally = tally
  round.closedAt = new Date().toISOString()
  for (const [player, count] of Object.entries(tally)) {
    attempt.totalVotes[player] = (attempt.totalVotes[player] ?? 0) + count
  }
  log(game, 'vote', `Голоса раунда ${round.number}: ` +
    (Object.entries(tally).map(([p, n]) => `${p} ${n}`).join(', ') || 'никто не голосовал'))

  const best = Math.max(0, ...Object.values(tally))
  const leaders = Object.keys(tally).filter(p => tally[p] === best)

  if (leaders.length === 0) {
    // nobody voted at all: the round simply runs again
    openRound(game, attempt)
    return game
  }
  if (leaders.length === 1) return elect(game, attempt, leaders[0], charge)

  round.tiedAmong = leaders
  game.phase = 'tiebreak'
  log(game, 'vote', `Ничья между: ${leaders.join(', ')}. Решает король.`)
  return game
}

/** The king breaks a tie, and cannot pick himself out of it. */
export function breakTie(game: KingsCourtGame, choice: string, charge: Charge): KingsCourtGame {
  const attempt = currentAttempt(game)
  const round = currentRound(attempt)
  if (!attempt || !round || game.phase !== 'tiebreak') return game
  game.phase = 'live'
  round.tiedAmong = []
  return elect(game, attempt, choice, charge)
}

export function applyClock(game: KingsCourtGame, charge: Charge, now = Date.now()): KingsCourtGame {
  if (game.phase !== 'live') return game
  const round = currentRound(currentAttempt(game))
  if (!round || round.closedAt || now < new Date(round.deadline).getTime()) return game
  return closeRound(game, charge)
}

// ---------- votes and checks ----------

export function castVote(game: KingsCourtGame, voter: string, target: string): KingsCourtGame {
  const attempt = currentAttempt(game)
  const round = currentRound(attempt)
  if (!attempt || !round) return game
  round.votes = { ...round.votes, [voter]: target }
  return game
}

export function submitCheck(game: KingsCourtGame, player: string, pair: string[]): KingsCourtGame {
  const round = currentRound(currentAttempt(game))
  if (!round || round.checkBy !== player) return game
  round.checkPair = pair
  return game
}

export function kingPeek(game: KingsCourtGame, names: string[]): KingsCourtGame {
  const attempt = currentAttempt(game)
  if (!attempt) return game
  attempt.kingPeeks = names
  for (const name of names) {
    note(game, attempt.king, `Вы посмотрели ${name}: ${roleName(attempt.seats[name].role)}.`)
  }
  log(game, 'setup', 'Король посмотрел двух игроков.')
  return game
}

export function roleName(role: KcRole): string {
  return role === 'king' ? 'король' : role === 'duke' ? 'герцог' : 'дворянин'
}

/** A paid peek never gives the king away: he shows up as a duke or a noble. */
export function peekRole(attempt: KcAttempt, target: string): KcRole {
  const role = attempt.seats[target]?.role
  if (role !== 'king') return role
  return Math.random() < 0.5 ? 'duke' : 'noble'
}

export function paidPeek(game: KingsCourtGame, player: string, target: string): KingsCourtGame {
  const attempt = currentAttempt(game)
  if (!attempt) return game
  note(game, player, `Вы заплатили ${PEEK_COST} псигемов и посмотрели ${target}: ${roleName(peekRole(attempt, target))}.`)
  return game
}

export function annoyedCheck(game: KingsCourtGame, player: string): KingsCourtGame {
  const attempt = currentAttempt(game)
  if (!attempt) return game
  const annoyed = attempt.seats[player]?.annoyed
  note(game, player, `Вы заплатили ${ANNOYED_COST} псигема и узнали: вы ${annoyed ? 'раздражили судью' : 'не раздражали судью'}.`)
  return game
}

// ---------- the payout ----------

export interface KcPayout {
  psigems: Record<string, number>
  tol: Record<string, number>
}

/**
 * What the result is worth. The king also owes a token of life to a duke and a
 * noble, which he hands over himself.
 */
export function payoutFor(attempt: KcAttempt): KcPayout {
  const psigems: Record<string, number> = {}
  const tol: Record<string, number> = {}
  if (!attempt.winner) return { psigems, tol }

  if (attempt.winner === 'king') {
    tol[attempt.king] = 3
    psigems[attempt.king] = Math.floor((attempt.court.length - 1) / 2)
    return { psigems, tol }
  }

  const role: KcRole = attempt.winner === 'dukes' ? 'duke' : 'noble'
  for (const player of membersOf(attempt, role)) {
    tol[player] = 1
    psigems[player] = 2
  }
  return { psigems, tol }
}

/**
 * The elimination candidate is the duke or noble with the fewest votes who did
 * not win, counting the bonus the early entrants got.
 */
export function ecCandidates(attempt: KcAttempt): { player: string; score: number }[] {
  if (!attempt.winner) return []
  const losing = players(attempt).filter(p => {
    const role = attempt.seats[p].role
    return role !== 'king' && teamOf(role) !== attempt.winner
  })
  return losing
    .map(player => ({ player, score: (attempt.totalVotes[player] ?? 0) + courtBonus(attempt, player) }))
    .sort((a, b) => a.score - b.score)
}

/** First into the court carries +5, the next +4, and so on down to nothing. */
export function courtBonus(attempt: KcAttempt, player: string): number {
  const place = attempt.court.indexOf(player)
  if (place < 0) return 0
  return Math.max(0, 5 - place)
}

export function setEc(game: KingsCourtGame, player: string): KingsCourtGame {
  game.ec = player
  game.phase = 'finished'
  log(game, 'end', `Кандидат на выбывание: ${player}.`)
  return game
}

// ---------- what a viewer sees ----------

export interface KcView {
  id: string
  name: string
  phase: KcPhase
  attemptNumber: number
  attemptsLeft: number
  court: string[]
  roster: string[]
  voters: string[]
  round: {
    number: number
    deadline: string
    voted: string[]
    tally: Record<string, number> | null
    tiedAmong: string[]
    checkBy: string | null
    checkDone: boolean
  } | null
  myVote: string | null
  myRole: KcRole | null
  amKing: boolean
  kingPeeksLeft: number
  notes: string[]
  totalVotes: Record<string, number>
  winner: KcTeam | null
  ec: string | null
  ecCandidates: { player: string; score: number }[]
  payout: KcPayout | null
  formerKings: string[]
  /** admin only, so the host can see the whole table */
  seats: Record<string, KcSeat> | null
  log: KcLogEntry[]
}

export function viewFor(game: KingsCourtGame, username: string, isAdmin: boolean): KcView {
  const attempt = currentAttempt(game)
  const round = currentRound(attempt)
  const over = game.phase === 'payout' || game.phase === 'finished'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    attemptNumber: attempt?.number ?? 0,
    attemptsLeft: MAX_ATTEMPTS - game.attempts.length,
    court: attempt?.court ?? [],
    roster: attempt ? players(attempt) : [],
    voters: attempt ? voters(attempt) : [],
    round: round ? {
      number: round.number,
      deadline: round.deadline,
      voted: Object.keys(round.votes),
      tally: round.tally,
      tiedAmong: round.tiedAmong,
      checkBy: round.checkBy,
      checkDone: round.checkPair != null,
    } : null,
    myVote: round?.votes[username] ?? null,
    myRole: attempt?.seats[username]?.role ?? null,
    amKing: !!attempt && attempt.king === username,
    kingPeeksLeft: attempt ? Math.max(0, 2 - attempt.kingPeeks.length) : 0,
    notes: game.notes[username] ?? [],
    totalVotes: attempt?.totalVotes ?? {},
    winner: attempt?.winner ?? null,
    ec: game.ec,
    ecCandidates: over && attempt ? ecCandidates(attempt) : [],
    payout: over && attempt ? payoutFor(attempt) : null,
    formerKings: game.formerKings,
    seats: isAdmin || game.phase === 'finished' ? (attempt?.seats ?? null) : null,
    log: game.log,
  }
}
