import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Locked Out: sixteen safes behind two dial locks, six players sealed in with
// them, and a choice between filling your arms with gold and getting out.

const PATH = join(process.cwd(), 'lockedout.json')

export const SAFE_COUNT = 16
export const ROUND_MS = 24 * 60 * 60 * 1000
export const KEYS_TO_ESCAPE = 3
export const GOLD_PER_SAFE = 2
export const DIGITS = [1, 2, 3, 4]
/** two of every number, eight cards in all */
export const HAND = [1, 1, 2, 2, 3, 3, 4, 4]
export const SAFE_LETTERS = 'ABCDEFGHIJKLMNOP'.split('')

export type LoPhase = 'setup' | 'live' | 'finished'
export type Colour = 'red' | 'blue' | 'green' | 'magenta' | 'yellow' | 'cyan' | 'white' | 'black'

export interface Combo {
  left: number
  right: number
}

/**
 * The three tests a wrong guess is measured against. Which colour belongs to
 * which test is never told to the players.
 */
export function conditionsMet(guess: Combo, lock: Combo): [boolean, boolean, boolean] {
  return [
    Math.abs(guess.left - guess.right) === Math.abs(lock.left - lock.right),
    guess.right === lock.right + 1 || guess.right === lock.right - 1,
    guess.left === lock.left || guess.left === lock.right,
  ]
}

/** One condition lights its own colour, two mix, three go white, none black. */
export function colourFor(guess: Combo, lock: Combo, order: [number, number, number]): Colour {
  const met = conditionsMet(guess, lock)
  // the host shuffles which condition drives which lamp
  const [r, b, g] = order.map(index => met[index]) as [boolean, boolean, boolean]
  if (r && b && g) return 'white'
  if (r && b) return 'magenta'
  if (r && g) return 'yellow'
  if (b && g) return 'cyan'
  if (r) return 'red'
  if (b) return 'blue'
  if (g) return 'green'
  return 'black'
}

export interface Safe {
  letter: string
  lock: Combo
  open: boolean
  /** revealed once the safe has closed again */
  closed: boolean
  openedBy: string[]
}

export interface SoloAttempt { kind: 'solo'; safe: string; left: number; right: number }
export interface DualAttempt { kind: 'dual'; safe: string; side: 'left' | 'right'; value: number; partner: string }
export type Attempt = SoloAttempt | DualAttempt

export interface Flash {
  safe: string
  guess: Combo
  colour: Colour
  round: number
  shared: boolean
}

export interface Bargain {
  safe: string
  players: string[]
  claims: Record<string, { gold: number; keys: number }>
  resolved: boolean
}

export interface LoLogEntry {
  at: string
  text: string
  kind: 'setup' | 'attempt' | 'safe' | 'bargain' | 'escape' | 'end'
}

export interface LockedOutGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  phase: LoPhase
  players: string[]
  /** which condition lights which lamp, hidden from everybody */
  order: [number, number, number]
  safes: Safe[]
  hands: Record<string, number[]>
  gold: Record<string, number>
  keys: Record<string, number>
  opened: Record<string, number>
  escaped: string[]
  round: number
  deadline: string | null
  attempts: Record<string, { solo?: SoloAttempt; dual?: DualAttempt }>
  bargains: Bargain[]
  flashes: Record<string, Flash[]>
  paidOut?: boolean
  log: LoLogEntry[]
  createdAt: string
}

// ---------- storage ----------

function readAll(): Record<string, LockedOutGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, LockedOutGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): LockedOutGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: LockedOutGame): void {
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

/** Every one of the sixteen combinations appears exactly once. */
export function dealSafes(): Safe[] {
  const combos: Combo[] = []
  for (const left of DIGITS) for (const right of DIGITS) combos.push({ left, right })
  return shuffle(combos).map((lock, i) => ({
    letter: SAFE_LETTERS[i], lock, open: false, closed: false, openedBy: [],
  }))
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): LockedOutGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: LockedOutGame = {
    id: slug, seasonSlug, matchId, name,
    phase: 'setup',
    players: [],
    order: [0, 1, 2],
    safes: dealSafes(),
    hands: {}, gold: {}, keys: {}, opened: {},
    escaped: [],
    round: 0, deadline: null,
    attempts: {}, bargains: [], flashes: {},
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: LockedOutGame): LockedOutGame {
  return {
    ...game,
    phase: 'setup', players: [], order: [0, 1, 2], safes: dealSafes(),
    hands: {}, gold: {}, keys: {}, opened: {}, escaped: [],
    round: 0, deadline: null, attempts: {}, bargains: [], flashes: {},
    paidOut: false, log: [],
  }
}

function log(game: LockedOutGame, kind: LoLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

export function inVault(game: LockedOutGame): string[] {
  return game.players.filter(p => !game.escaped.includes(p))
}

export function safeOf(game: LockedOutGame, letter: string): Safe | null {
  return game.safes.find(s => s.letter === letter) ?? null
}

// ---------- the match ----------

export function startGame(game: LockedOutGame, players: string[]): LockedOutGame {
  game.players = players
  game.safes = dealSafes()
  game.order = shuffle([0, 1, 2]) as [number, number, number]
  game.hands = Object.fromEntries(players.map(p => [p, [...HAND]]))
  game.gold = Object.fromEntries(players.map(p => [p, 0]))
  game.keys = Object.fromEntries(players.map(p => [p, 0]))
  game.opened = Object.fromEntries(players.map(p => [p, 0]))
  game.escaped = []
  game.round = 1
  game.deadline = new Date(Date.now() + ROUND_MS).toISOString()
  game.attempts = {}
  game.bargains = []
  game.flashes = Object.fromEntries(players.map(p => [p, []]))
  game.phase = 'live'
  log(game, 'setup', `Хранилище заперто. Внутри ${players.length} человек и ${SAFE_COUNT} сейфов.`)
  return game
}

function spend(game: LockedOutGame, player: string, values: number[]): void {
  let hand = [...(game.hands[player] ?? [])]
  for (const value of values) {
    const index = hand.indexOf(value)
    if (index >= 0) hand = hand.filter((_, i) => i !== index)
  }
  game.hands = { ...game.hands, [player]: hand }
}

/** Whether a player still holds these cards, counting duplicates properly. */
export function canPlay(hand: number[], values: number[]): boolean {
  const left = [...hand]
  for (const value of values) {
    const index = left.indexOf(value)
    if (index < 0) return false
    left.splice(index, 1)
  }
  return true
}

function flash(game: LockedOutGame, player: string, entry: Flash): void {
  game.flashes = { ...game.flashes, [player]: [...(game.flashes[player] ?? []), entry] }
}

/** Bargains settle first, so a third key locks its owner out of this round. */
function resolveBargains(game: LockedOutGame): void {
  for (const bargain of game.bargains.filter(b => !b.resolved)) {
    const safe = safeOf(game, bargain.safe)
    bargain.resolved = true
    if (!safe) continue

    const claimedGold = bargain.players.reduce((sum, p) => sum + (bargain.claims[p]?.gold ?? 0), 0)
    const claimedKeys = bargain.players.reduce((sum, p) => sum + (bargain.claims[p]?.keys ?? 0), 0)
    const agreed = claimedGold === GOLD_PER_SAFE && claimedKeys === 1

    if (!agreed) {
      log(game, 'bargain', `Сейф ${safe.letter}: договориться не вышло, сейф закрыт и всё осталось внутри.`)
      safe.closed = true
      continue
    }
    for (const player of bargain.players) {
      const claim = bargain.claims[player] ?? { gold: 0, keys: 0 }
      game.gold = { ...game.gold, [player]: (game.gold[player] ?? 0) + claim.gold }
      game.keys = { ...game.keys, [player]: (game.keys[player] ?? 0) + claim.keys }
    }
    safe.closed = true
    log(game, 'bargain', `Сейф ${safe.letter}: делёж состоялся.`)
  }
  game.bargains = game.bargains.filter(b => !b.resolved)
  checkEscapes(game)
}

function checkEscapes(game: LockedOutGame): void {
  for (const player of inVault(game)) {
    if ((game.keys[player] ?? 0) < KEYS_TO_ESCAPE) continue
    game.escaped = [...game.escaped, player]
    log(game, 'escape', `${player} собрал три ключа и вышел из хранилища.`)
  }
}

/** A dual attempt only happens when both halves name each other and differ. */
export function pairedAttempts(game: LockedOutGame): [string, DualAttempt][] {
  const out: [string, DualAttempt][] = []
  for (const [player, entry] of Object.entries(game.attempts)) {
    const dual = entry.dual
    if (!dual) continue
    const theirs = game.attempts[dual.partner]?.dual
    if (!theirs) continue
    if (theirs.partner !== player || theirs.safe !== dual.safe) continue
    if (theirs.side === dual.side) continue
    out.push([player, dual])
  }
  return out
}

export function closeRound(game: LockedOutGame): LockedOutGame {
  resolveBargains(game)

  // every guess aimed at each safe, solo ones and matched pairs alike
  const guesses: { safe: string; players: string[]; guess: Combo; cards: Record<string, number[]> }[] = []

  for (const [player, entry] of Object.entries(game.attempts)) {
    if (!entry.solo || game.escaped.includes(player)) continue
    guesses.push({
      safe: entry.solo.safe,
      players: [player],
      guess: { left: entry.solo.left, right: entry.solo.right },
      cards: { [player]: [entry.solo.left, entry.solo.right] },
    })
  }

  const seen = new Set<string>()
  for (const [player, dual] of pairedAttempts(game)) {
    const key = [player, dual.partner].sort().join('|') + dual.safe
    if (seen.has(key)) continue
    seen.add(key)
    if (game.escaped.includes(player) || game.escaped.includes(dual.partner)) continue
    const theirs = game.attempts[dual.partner]!.dual!
    const left = dual.side === 'left' ? dual.value : theirs.value
    const right = dual.side === 'right' ? dual.value : theirs.value
    guesses.push({
      safe: dual.safe,
      players: [player, dual.partner],
      guess: { left, right },
      cards: { [player]: [dual.value], [dual.partner]: [theirs.value] },
    })
  }

  for (const attempt of guesses) {
    const safe = safeOf(game, attempt.safe)
    if (!safe || safe.open) continue
    const right = safe.lock.left === attempt.guess.left && safe.lock.right === attempt.guess.right
    const shared = attempt.players.length > 1

    if (!right) {
      const colour = colourFor(attempt.guess, safe.lock, game.order)
      for (const player of attempt.players) {
        flash(game, player, { safe: safe.letter, guess: attempt.guess, colour, round: game.round, shared })
      }
      continue
    }

    for (const player of attempt.players) {
      spend(game, player, attempt.cards[player] ?? [])
      game.opened = { ...game.opened, [player]: (game.opened[player] ?? 0) + 1 }
    }
    safe.open = true
    safe.openedBy = [...new Set([...safe.openedBy, ...attempt.players])]
  }

  // a safe cracked by exactly one person on their own pays out at once
  for (const safe of game.safes.filter(s => s.open && !s.closed)) {
    if (safe.openedBy.length === 1) {
      const player = safe.openedBy[0]
      game.gold = { ...game.gold, [player]: (game.gold[player] ?? 0) + GOLD_PER_SAFE }
      game.keys = { ...game.keys, [player]: (game.keys[player] ?? 0) + 1 }
      safe.closed = true
      log(game, 'safe', `Сейф ${safe.letter} вскрыт в одиночку: ${player} забирает всё.`)
    } else {
      game.bargains = [...game.bargains, {
        safe: safe.letter, players: safe.openedBy, claims: {}, resolved: false,
      }]
      log(game, 'safe', `Сейф ${safe.letter} вскрыт. Делят: ${safe.openedBy.join(', ')}.`)
    }
  }

  checkEscapes(game)
  game.attempts = {}
  game.round += 1
  game.deadline = new Date(Date.now() + ROUND_MS).toISOString()

  if (isOver(game)) return finish(game)
  return game
}

/** Nothing left to crack, or nobody left inside who could crack it. */
export function isOver(game: LockedOutGame): boolean {
  if (game.safes.every(s => s.open)) return true
  return inVault(game).length === 0
}

export function finish(game: LockedOutGame): LockedOutGame {
  resolveBargains(game)
  game.phase = 'finished'
  game.deadline = null
  log(game, 'end', `Матч окончен. Вышли: ${game.escaped.join(', ') || 'никто'}.`)
  return game
}

export function winnersOf(game: LockedOutGame): string[] {
  if (game.escaped.length === 0) return []
  const best = Math.max(...game.escaped.map(p => game.gold[p] ?? 0))
  return game.escaped.filter(p => (game.gold[p] ?? 0) === best)
}

/** Most safes opened takes the opal, more cards left breaks a tie. */
export function opalWinner(game: LockedOutGame): string | null {
  const best = Math.max(0, ...game.players.map(p => game.opened[p] ?? 0))
  if (best === 0) return null
  const leaders = game.players.filter(p => (game.opened[p] ?? 0) === best)
  if (leaders.length === 1) return leaders[0]
  const mostCards = Math.max(...leaders.map(p => (game.hands[p] ?? []).length))
  const byCards = leaders.filter(p => (game.hands[p] ?? []).length === mostCards)
  return byCards.length === 1 ? byCards[0] : null
}

export interface LoPayout {
  psigems: Record<string, number>
  tol: Record<string, number>
  opals: Record<string, number>
}

/** Two gold bars are worth a psigem, and a lone winner earns a token of life. */
export function payoutFor(game: LockedOutGame): LoPayout {
  const psigems: Record<string, number> = {}
  const tol: Record<string, number> = {}
  const opals: Record<string, number> = {}

  for (const player of game.escaped) {
    const bars = game.gold[player] ?? 0
    const earned = Math.floor(bars / 2)
    if (earned > 0) psigems[player] = earned
  }
  const winners = winnersOf(game)
  if (winners.length === 1 && game.escaped.length > 1) tol[winners[0]] = 1

  const opal = opalWinner(game)
  if (opal) opals[opal] = 1
  return { psigems, tol, opals }
}

export function applyClock(game: LockedOutGame, now = Date.now()): LockedOutGame {
  if (game.phase !== 'live' || !game.deadline) return game
  if (now < new Date(game.deadline).getTime()) return game
  return closeRound(game)
}

// ---------- what a viewer sees ----------

export interface LoView {
  id: string
  name: string
  phase: LoPhase
  players: string[]
  round: number
  deadline: string | null
  safes: { letter: string; open: boolean; closed: boolean; lock: Combo | null; openedBy: string[] }[]
  myHand: number[]
  myGold: number
  myKeys: number
  myOpened: number
  myFlashes: Flash[]
  myAttempts: { solo?: SoloAttempt; dual?: DualAttempt } | null
  myBargains: Bargain[]
  escaped: string[]
  amPlaying: boolean
  standings: { player: string; escaped: boolean; gold: number | null; keys: number | null; cards: number }[]
  payout: LoPayout | null
  log: LoLogEntry[]
}

export function viewFor(game: LockedOutGame, username: string, isAdmin: boolean): LoView {
  const over = game.phase === 'finished'

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    players: game.players,
    round: game.round,
    deadline: game.deadline,
    safes: game.safes.map(safe => ({
      letter: safe.letter,
      open: safe.open,
      closed: safe.closed,
      // a combination is public only once the safe has shut again
      lock: safe.closed || over || isAdmin ? safe.lock : null,
      openedBy: safe.openedBy,
    })),
    myHand: game.hands[username] ?? [],
    myGold: game.gold[username] ?? 0,
    myKeys: game.keys[username] ?? 0,
    myOpened: game.opened[username] ?? 0,
    myFlashes: game.flashes[username] ?? [],
    myAttempts: game.attempts[username] ?? null,
    myBargains: game.bargains.filter(b => b.players.includes(username)),
    escaped: game.escaped,
    amPlaying: game.players.includes(username) && !game.escaped.includes(username),
    standings: game.players.map(player => ({
      player,
      escaped: game.escaped.includes(player),
      // what somebody is carrying is their own business until the doors open
      gold: over || isAdmin || player === username ? (game.gold[player] ?? 0) : null,
      keys: over || isAdmin || player === username ? (game.keys[player] ?? 0) : null,
      cards: (game.hands[player] ?? []).length,
    })),
    payout: over ? payoutFor(game) : null,
    log: game.log,
  }
}
