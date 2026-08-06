import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Letterbox: a two player deathmatch of deduction over hidden five letter hands.
// Storage mirrors the other games: one flat JSON file keyed by game slug.

const PATH = join(process.cwd(), 'letterbox.json')

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const HAND_SIZE = 5
export const TURN_MS = 120_000       // to choose an action
export const PICK_MS = 60_000        // to choose none / one / any
export const RESERVE_MS = 300_000    // per player, drained once the base time is gone

export type LbPhase = 'setup' | 'hold1' | 'hold2' | 'live' | 'finished'
export type Category = 'none' | 'one' | 'any'

export interface LbPending {
  word: string
  submitter: string
  waitingOn: string
  startedAt: string
  opponentPick: Category | null
  submitterPick: Category | null
}

export interface LbLogEntry {
  at: string
  text: string
  /** shown to everyone; hands themselves are never logged */
  kind: 'setup' | 'word' | 'guess' | 'timeout' | 'end'
}

export interface LetterboxGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  /** the elimination candidate and the player they picked; the opponent moves first */
  ec: string | null
  opponent: string | null
  phase: LbPhase
  hands: Record<string, string[]>
  /** letters kept for the redraw, null until that player has submitted */
  holds: Record<string, string[] | null>
  /** one letter for every season player outside the duel */
  observerLetters: Record<string, string>
  /** letters that left a hand, and are therefore public */
  lostLetters: Record<string, string[]>
  turn: string | null
  turnStartedAt: string | null
  reserveMs: Record<string, number>
  usedWords: string[]
  pending: LbPending | null
  log: LbLogEntry[]
  winner: string | null
  createdAt: string
}

function readAll(): Record<string, LetterboxGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, LetterboxGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): LetterboxGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: LetterboxGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): LetterboxGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: LetterboxGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null,
    phase: 'setup',
    hands: {}, holds: {}, observerLetters: {}, lostLetters: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    usedWords: [], pending: null, log: [], winner: null,
    createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: LetterboxGame): LetterboxGame {
  return {
    ...game,
    phase: 'setup',
    hands: {}, holds: {}, observerLetters: {}, lostLetters: {},
    turn: null, turnStartedAt: null, reserveMs: {},
    usedWords: [], pending: null, log: [], winner: null,
  }
}

// ---------- helpers ----------

export function duelists(game: LetterboxGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: LetterboxGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

function log(game: LetterboxGame, kind: LbLogEntry['kind'], text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text, kind }]
}

function draw(pool: string[], count: number): string[] {
  const taken: string[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    taken.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
  }
  return taken
}

/** Letters nobody is holding right now, so a redraw can hand them out again. */
function freePool(game: LetterboxGame, keep: string[][]): string[] {
  const used = new Set(keep.flat())
  return ALPHABET.filter(l => !used.has(l))
}

// ---------- setup ----------

export function dealOpening(game: LetterboxGame): LetterboxGame {
  const [a, b] = duelists(game)
  const pool = [...ALPHABET]
  game.hands = { [a]: draw(pool, HAND_SIZE), [b]: draw(pool, HAND_SIZE) }
  game.holds = { [a]: null, [b]: null }
  game.phase = 'hold1'
  log(game, 'setup', 'Розданы стартовые руки. Первая фаза удержания.')
  return game
}

export function submitHold(game: LetterboxGame, player: string, letters: string[]): LetterboxGame {
  const hand = game.hands[player] ?? []
  game.holds = { ...game.holds, [player]: letters.filter(l => hand.includes(l)) }

  const both = duelists(game).every(p => game.holds[p] != null)
  if (!both) return game

  // both have chosen: replace whatever was not held, keeping the two hands disjoint
  const held = duelists(game).map(p => game.holds[p] ?? [])
  const pool = freePool(game, held)
  for (const p of duelists(game)) {
    const keep = game.holds[p] ?? []
    game.hands = { ...game.hands, [p]: [...keep, ...draw(pool, HAND_SIZE - keep.length)] }
  }
  game.holds = Object.fromEntries(duelists(game).map(p => [p, null]))

  if (game.phase === 'hold1') {
    game.phase = 'hold2'
    log(game, 'setup', 'Первая замена сделана. Вторая фаза удержания.')
  } else {
    game.phase = 'live'
    log(game, 'setup', 'Руки собраны. Игра началась.')
  }
  return game
}

/** One letter each for the players outside the duel, none of them in a duelist's hand. */
export function dealObserverLetters(game: LetterboxGame, observers: string[]): LetterboxGame {
  const pool = freePool(game, duelists(game).map(p => game.hands[p] ?? []))
  const letters: Record<string, string> = {}
  for (const o of observers) {
    const [letter] = draw(pool, 1)
    if (letter) letters[o] = letter
  }
  game.observerLetters = letters
  return game
}

export function startLive(game: LetterboxGame): LetterboxGame {
  game.phase = 'live'
  game.turn = game.opponent
  game.turnStartedAt = new Date().toISOString()
  game.reserveMs = Object.fromEntries(duelists(game).map(p => [p, RESERVE_MS]))
  game.pending = null
  return game
}

// ---------- clock ----------

/** Who is on the clock, with the base allowance for what they owe. */
function onClock(game: LetterboxGame): { player: string; startedAt: string; base: number } | null {
  if (game.phase !== 'live') return null
  if (game.pending) {
    return { player: game.pending.waitingOn, startedAt: game.pending.startedAt, base: PICK_MS }
  }
  if (game.turn && game.turnStartedAt) {
    return { player: game.turn, startedAt: game.turnStartedAt, base: TURN_MS }
  }
  return null
}

/** Hard limit: base time, then the reserve drains into it. */
export function deadlineOf(game: LetterboxGame): { player: string; deadline: number } | null {
  const clock = onClock(game)
  if (!clock) return null
  const reserve = game.reserveMs[clock.player] ?? 0
  return { player: clock.player, deadline: new Date(clock.startedAt).getTime() + clock.base + reserve }
}

/** Charge the elapsed overtime to the reserve; called whenever a player acts. */
function chargeReserve(game: LetterboxGame, now: number): void {
  const clock = onClock(game)
  if (!clock) return
  const over = now - (new Date(clock.startedAt).getTime() + clock.base)
  if (over <= 0) return
  const left = game.reserveMs[clock.player] ?? 0
  game.reserveMs = { ...game.reserveMs, [clock.player]: Math.max(0, left - over) }
}

function nextTurn(game: LetterboxGame, player: string): void {
  game.turn = other(game, player)
  game.turnStartedAt = new Date().toISOString()
  game.pending = null
}

/**
 * Apply anything the clock owes. Runs on every read, so a game left alone still
 * moves on: a missed pick simply yields no hint, a missed turn is skipped.
 */
export function applyClock(game: LetterboxGame, now = Date.now()): LetterboxGame {
  const limit = deadlineOf(game)
  if (!limit || now < limit.deadline) return game

  game.reserveMs = { ...game.reserveMs, [limit.player]: 0 }

  if (game.pending) {
    const p = game.pending
    if (p.waitingOn === p.submitter) {
      log(game, 'timeout', `${p.submitter} не выбрал категорию и остался без подсказки`)
      resolveWord(game)
    } else {
      log(game, 'timeout', `${p.waitingOn} не выбрал категорию и остался без подсказки`)
      game.pending = { ...p, opponentPick: null, waitingOn: p.submitter, startedAt: new Date().toISOString() }
    }
    return game
  }

  const skipped = game.turn!
  log(game, 'timeout', `${skipped} не успел сходить, ход пропущен`)
  nextTurn(game, skipped)
  return game
}

// ---------- actions ----------

export function categoryHit(category: Category, word: string, hand: string[]): boolean {
  const letters = new Set(word.toUpperCase().split(''))
  const matches = [...letters].filter(l => hand.includes(l)).length
  if (category === 'none') return matches === 0
  if (category === 'one') return matches === 1
  return matches >= 1
}

export function submitWord(game: LetterboxGame, player: string, word: string): LetterboxGame {
  chargeReserve(game, Date.now())
  const clean = word.trim().toLowerCase()
  game.usedWords = [...game.usedWords, clean]
  game.pending = {
    word: clean,
    submitter: player,
    waitingOn: other(game, player),
    startedAt: new Date().toISOString(),
    opponentPick: null,
    submitterPick: null,
  }
  log(game, 'word', `${player} подал слово «${clean.toUpperCase()}»`)
  return game
}

export function pickCategory(game: LetterboxGame, player: string, category: Category): LetterboxGame {
  chargeReserve(game, Date.now())
  const p = game.pending
  if (!p) return game

  if (player === p.submitter) {
    game.pending = { ...p, submitterPick: category }
    resolveWord(game)
  } else {
    game.pending = { ...p, opponentPick: category, waitingOn: p.submitter, startedAt: new Date().toISOString() }
  }
  return game
}

const CATEGORY_LABEL: Record<Category, string> = { none: 'None', one: 'One', any: 'Any' }

function resolveWord(game: LetterboxGame): void {
  const p = game.pending
  if (!p) return
  const opponent = other(game, p.submitter)

  if (p.opponentPick) {
    const hit = categoryHit(p.opponentPick, p.word, game.hands[p.submitter] ?? [])
    log(game, 'word', `${opponent}: ${CATEGORY_LABEL[p.opponentPick]} по руке ${p.submitter} — ${hit ? 'попадание' : 'промах'}`)
  }
  if (p.submitterPick) {
    const hit = categoryHit(p.submitterPick, p.word, game.hands[opponent] ?? [])
    log(game, 'word', `${p.submitter}: ${CATEGORY_LABEL[p.submitterPick]} по руке ${opponent} — ${hit ? 'попадание' : 'промах'}`)
  }
  nextTurn(game, p.submitter)
}

export function guessLetter(
  game: LetterboxGame, player: string, letter: string, discard: string,
): LetterboxGame {
  chargeReserve(game, Date.now())
  const rival = other(game, player)
  const rivalHand = game.hands[rival] ?? []

  if (rivalHand.includes(letter)) {
    game.hands = { ...game.hands, [rival]: rivalHand.filter(l => l !== letter) }
    game.lostLetters = { ...game.lostLetters, [rival]: [...(game.lostLetters[rival] ?? []), letter] }
    log(game, 'guess', `${player} назвал ${letter} и попал: буква ушла из руки ${rival}`)
    if ((game.hands[rival] ?? []).length === 0) return finish(game, player, `рука ${rival} опустела`)
  } else {
    const ownHand = game.hands[player] ?? []
    const lost = ownHand.includes(discard) ? discard : ownHand[0]
    game.hands = { ...game.hands, [player]: ownHand.filter(l => l !== lost) }
    game.lostLetters = { ...game.lostLetters, [player]: [...(game.lostLetters[player] ?? []), lost] }
    log(game, 'guess', `${player} назвал ${letter} и промахнулся: теряет свою букву ${lost}`)
    if ((game.hands[player] ?? []).length === 0) return finish(game, rival, `рука ${player} опустела`)
  }

  nextTurn(game, player)
  return game
}

export function lastChance(game: LetterboxGame, player: string, letters: string[]): LetterboxGame {
  chargeReserve(game, Date.now())
  const rival = other(game, player)
  const hand = [...(game.hands[rival] ?? [])].sort()
  const named = [...new Set(letters.map(l => l.toUpperCase()))].sort()
  const exact = hand.length === named.length && hand.every((l, i) => l === named[i])

  log(game, 'guess', `${player} идёт на Last Chance: ${named.join(', ')}`)
  return exact
    ? finish(game, player, 'Last Chance угадан полностью')
    : finish(game, rival, `Last Chance не угадан игроком ${player}`)
}

function finish(game: LetterboxGame, winner: string, reason: string): LetterboxGame {
  game.phase = 'finished'
  game.winner = winner
  game.turn = null
  game.pending = null
  log(game, 'end', `Победа: ${winner} (${reason})`)
  return game
}

export function skipTurn(game: LetterboxGame): LetterboxGame {
  if (game.phase !== 'live') return game
  if (game.pending) {
    const p = game.pending
    if (p.waitingOn === p.submitter) resolveWord(game)
    else game.pending = { ...p, opponentPick: null, waitingOn: p.submitter, startedAt: new Date().toISOString() }
    return game
  }
  const player = game.turn
  if (!player) return game
  log(game, 'timeout', `Ведущий пропустил ход игрока ${player}`)
  nextTurn(game, player)
  return game
}

// ---------- what each viewer is allowed to see ----------

export interface LbView {
  id: string
  name: string
  phase: LbPhase
  ec: string | null
  opponent: string | null
  turn: string | null
  winner: string | null
  usedWords: string[]
  log: LbLogEntry[]
  pending: (Omit<LbPending, 'opponentPick' | 'submitterPick'> & {
    opponentPicked: boolean
    submitterPicked: boolean
    myPick: Category | null
    takenByOpponent: Category | null
  }) | null
  deadline: number | null
  deadlineFor: string | null
  reserveMs: Record<string, number>
  handSizes: Record<string, number>
  lostLetters: Record<string, string[]>
  myHand: string[] | null
  myLetter: string | null
  isDuelist: boolean
  /** admin only */
  allHands: Record<string, string[]> | null
  allObserverLetters: Record<string, string> | null
}

export function viewFor(game: LetterboxGame, username: string, isAdmin: boolean): LbView {
  const limit = deadlineOf(game)
  const isDuelist = duelists(game).includes(username)
  const p = game.pending

  return {
    id: game.id,
    name: game.name,
    phase: game.phase,
    ec: game.ec,
    opponent: game.opponent,
    turn: game.turn,
    winner: game.winner,
    usedWords: game.usedWords,
    log: game.log,
    pending: p ? {
      word: p.word,
      submitter: p.submitter,
      waitingOn: p.waitingOn,
      startedAt: p.startedAt,
      opponentPicked: p.opponentPick != null,
      submitterPicked: p.submitterPick != null,
      // a duelist may see the category they chose, never the other one's
      myPick: username === p.submitter ? p.submitterPick : username === other(game, p.submitter) ? p.opponentPick : null,
      // the submitter picks from what is left, so they must know what was taken
      takenByOpponent: username === p.submitter ? p.opponentPick : null,
    } : null,
    deadline: limit?.deadline ?? null,
    deadlineFor: limit?.player ?? null,
    reserveMs: game.reserveMs,
    handSizes: Object.fromEntries(duelists(game).map(d => [d, (game.hands[d] ?? []).length])),
    lostLetters: game.lostLetters,
    myHand: isDuelist ? (game.hands[username] ?? []) : null,
    myLetter: game.observerLetters[username] ?? null,
    isDuelist,
    allHands: isAdmin || game.phase === 'finished' ? game.hands : null,
    allObserverLetters: isAdmin ? game.observerLetters : null,
  }
}
