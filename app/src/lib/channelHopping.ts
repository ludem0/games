import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Channel Hopping: six tasks running at once for eighteen rounds of ninety
// seconds. Everything is graded by the machine, so the host loads the content
// in advance and then only watches.

const PATH = join(process.cwd(), 'channelhopping.json')

export const ROUNDS = 18
export const ROUND_MS = 90_000
export const BW_TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8]
export const BW_PRIZE = 8
/** a new collection category lands on these rounds, a new gyul hap board every third */
export const COLLECTION_ROUNDS = [1, 7, 13]

export type Channel = 'five' | 'integer' | 'animal' | 'collection' | 'gyulhap' | 'bw'
export const CHANNELS: Channel[] = ['five', 'integer', 'animal', 'collection', 'gyulhap', 'bw']

export const CHANNEL_NAMES: Record<Channel, string> = {
  five: 'FIVE', integer: 'INTEGER', animal: 'ANIMAL',
  collection: 'COLLECTION', gyulhap: 'GYUL HAP', bw: 'BLACK AND WHITE',
}

// ---------- gyul hap ----------

export type Colour = 'red' | 'blue' | 'yellow'
export type Shape = 'circle' | 'triangle' | 'square'
export type Background = 'white' | 'black' | 'grey'

export interface Card {
  colour: Colour
  shape: Shape
  background: Background
}

const COLOURS: Colour[] = ['red', 'blue', 'yellow']
const SHAPES: Shape[] = ['circle', 'triangle', 'square']
const BACKGROUNDS: Background[] = ['white', 'black', 'grey']

/** Three cards make a hap when every trait is all alike or all different. */
export function isHap(a: Card, b: Card, c: Card): boolean {
  const traits: (keyof Card)[] = ['colour', 'shape', 'background']
  return traits.every(trait => {
    const values = new Set([a[trait], b[trait], c[trait]])
    return values.size === 1 || values.size === 3
  })
}

export function allHaps(board: Card[]): number[][] {
  const found: number[][] = []
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (isHap(board[i], board[j], board[k])) found.push([i, j, k])
      }
    }
  }
  return found
}

function randomCard(): Card {
  const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]
  return { colour: pick(COLOURS), shape: pick(SHAPES), background: pick(BACKGROUNDS) }
}

/** Boards are dealt until one holds at least five haps, as the rules promise. */
export function makeBoard(minHaps = 5): Card[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const board = Array.from({ length: 9 }, randomCard)
    if (new Set(board.map(c => `${c.colour}${c.shape}${c.background}`)).size < 9) continue
    if (allHaps(board).length >= minHaps) return board
  }
  return Array.from({ length: 9 }, randomCard)
}

// ---------- the content the host loads ----------

export interface FiveTask { clues: string[]; answer: string }
export interface IntegerTask { question: string; answer: number }
export interface AnimalTask { question: string; answers: string[] }
export interface CollectionTask { category: string; accepted: string[] }

export interface ChContent {
  five: FiveTask[]
  integer: IntegerTask[]
  animal: AnimalTask[]
  collections: CollectionTask[]
}

export const EMPTY_CONTENT: ChContent = { five: [], integer: [], animal: [], collections: [] }

export interface ChSubmission {
  at: string
  text: string
  /** what the grader made of it, filled in straight away */
  points: number
  verdict: string
  /** the tile black and white actually took from this answer */
  value?: number
}

export interface ChGame {
  id: string
  seasonSlug: string
  matchId: string | null
  name: string
  ec: string | null
  opponent: string | null
  /** the player who wins a dead heat, set by the host from the garnet counts */
  advantage: string | null
  content: ChContent
  boards: Card[][]
  startedAt: string | null
  finishedAt: string | null
  /** round -> channel -> player -> what they sent */
  entries: Record<string, Record<string, Record<string, ChSubmission>>>
  points: Record<string, number>
  /** answers already used, so a repeat can be caught */
  usedCollection: string[]
  usedHaps: Record<string, string[]>
  /** black and white: the tiles each player has left and the battles so far */
  bwHand: Record<string, number[]>
  bwBattles: { round: number; played: Record<string, number>; winner: string | null }[]
  bwFirst: string | null
  log: { at: string; text: string }[]
  createdAt: string
}

function readAll(): Record<string, ChGame> {
  if (!existsSync(PATH)) return {}
  try { return JSON.parse(readFileSync(PATH, 'utf-8')) } catch { return {} }
}

function writeAll(data: Record<string, ChGame>): void {
  writeFileSync(PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getGame(slug: string): ChGame | null {
  return readAll()[slug] ?? null
}

export function saveGame(game: ChGame): void {
  const all = readAll()
  all[game.id] = game
  writeAll(all)
}

export function createGame(slug: string, seasonSlug: string, name: string, matchId: string | null): ChGame {
  const existing = getGame(slug)
  if (existing) return existing
  const game: ChGame = {
    id: slug, seasonSlug, matchId, name,
    ec: null, opponent: null, advantage: null,
    content: EMPTY_CONTENT,
    boards: [],
    startedAt: null, finishedAt: null,
    entries: {}, points: {},
    usedCollection: [], usedHaps: {},
    bwHand: {}, bwBattles: [], bwFirst: null,
    log: [], createdAt: new Date().toISOString(),
  }
  saveGame(game)
  return game
}

export function resetGame(game: ChGame): ChGame {
  return {
    ...game,
    startedAt: null, finishedAt: null,
    entries: {}, points: {},
    usedCollection: [], usedHaps: {},
    bwHand: {}, bwBattles: [], bwFirst: null,
    boards: [], log: [],
  }
}

// ---------- the clock ----------

export function duelists(game: ChGame): string[] {
  return [game.ec, game.opponent].filter((p): p is string => !!p)
}

export function other(game: ChGame, player: string): string {
  return player === game.ec ? (game.opponent ?? '') : (game.ec ?? '')
}

/** Which round the wall clock says we are in, or null before and after. */
export function roundAt(game: ChGame, now = Date.now()): number | null {
  if (!game.startedAt) return null
  const elapsed = now - new Date(game.startedAt).getTime()
  if (elapsed < 0) return null
  const round = Math.floor(elapsed / ROUND_MS) + 1
  return round > ROUNDS ? null : round
}

export function roundEndsAt(game: ChGame, round: number): number {
  return new Date(game.startedAt!).getTime() + round * ROUND_MS
}

/** The collection category and the gyul hap board a round is played with. */
export function collectionIndex(round: number): number {
  return COLLECTION_ROUNDS.filter(start => round >= start).length - 1
}

export function boardIndex(round: number): number {
  return Math.floor((round - 1) / 3)
}

/** Black and white puts a tile up on every other round. */
export function isBwRound(round: number): boolean {
  return round % 2 === 1
}

export function bwBattleIndex(round: number): number {
  return Math.floor((round - 1) / 2)
}

// ---------- grading ----------

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

function award(game: ChGame, player: string, points: number): void {
  game.points = { ...game.points, [player]: (game.points[player] ?? 0) + points }
}

function log(game: ChGame, text: string): void {
  game.log = [...game.log, { at: new Date().toISOString(), text }]
}

function entryFor(game: ChGame, round: number, channel: Channel, player: string): ChSubmission | null {
  return game.entries[round]?.[channel]?.[player] ?? null
}

function store(game: ChGame, round: number, channel: Channel, player: string, entry: ChSubmission): void {
  const byChannel = { ...(game.entries[round] ?? {}) }
  byChannel[channel] = { ...(byChannel[channel] ?? {}), [player]: entry }
  game.entries = { ...game.entries, [round]: byChannel }
}

/** Somebody already took the point for being first and right. */
function pointTaken(game: ChGame, round: number, channel: Channel): boolean {
  const byPlayer = game.entries[round]?.[channel] ?? {}
  return Object.values(byPlayer).some(entry => entry.points > 0)
}

function gradeFive(game: ChGame, round: number, text: string): { points: number; verdict: string } {
  const task = game.content.five[round - 1]
  if (!task) return { points: 0, verdict: 'нет задания' }
  const right = normalise(task.answer) === normalise(text)
  if (!right) return { points: 0, verdict: 'мимо' }
  return pointTaken(game, round, 'five')
    ? { points: 0, verdict: 'верно, но соперник был первым' }
    : { points: 1, verdict: 'верно и первым' }
}

function gradeInteger(game: ChGame, round: number, text: string): { points: number; verdict: string } {
  const task = game.content.integer[round - 1]
  if (!task) return { points: 0, verdict: 'нет задания' }
  const value = Number(text.trim())
  if (!Number.isInteger(value) || value < 0 || value > 100) return { points: 0, verdict: 'нужно целое от 0 до 100' }
  if (value !== task.answer) return { points: 0, verdict: 'мимо' }
  return pointTaken(game, round, 'integer')
    ? { points: 0, verdict: 'верно, но соперник был первым' }
    : { points: 1, verdict: 'верно и первым' }
}

function gradeAnimal(game: ChGame, round: number, text: string): { points: number; verdict: string } {
  const task = game.content.animal[round - 1]
  if (!task) return { points: 0, verdict: 'нет задания' }
  const right = task.answers.some(answer => normalise(answer) === normalise(text))
  if (!right) return { points: 0, verdict: 'мимо' }
  return pointTaken(game, round, 'animal')
    ? { points: 0, verdict: 'верно, но соперник был первым' }
    : { points: 1, verdict: 'верно и первым' }
}

function gradeCollection(game: ChGame, round: number, text: string): { points: number; verdict: string } {
  const task = game.content.collections[collectionIndex(round)]
  if (!task) return { points: 0, verdict: 'нет категории' }
  const answer = normalise(text)
  if (game.usedCollection.includes(answer)) return { points: -1, verdict: 'это уже называли' }
  if (!task.accepted.some(a => normalise(a) === answer)) return { points: -1, verdict: 'не подходит под категорию' }
  game.usedCollection = [...game.usedCollection, answer]
  return { points: 1, verdict: 'засчитано' }
}

function gradeGyulHap(game: ChGame, round: number, text: string): { points: number; verdict: string } {
  const index = boardIndex(round)
  const board = game.boards[index]
  if (!board) return { points: 0, verdict: 'нет доски' }
  const given = game.usedHaps[index] ?? []
  const remaining = allHaps(board).filter(hap => !given.includes(hap.join(',')))

  if (normalise(text) === 'gyul') {
    return remaining.length === 0
      ? { points: 2, verdict: 'гюль верный: хапов больше нет' }
      : { points: -1, verdict: 'гюль неверный: хапы ещё есть' }
  }

  const picked = text.split(/[^0-9]+/).filter(Boolean).map(Number).map(n => n - 1).sort((a, b) => a - b)
  if (picked.length !== 3 || picked.some(i => i < 0 || i > 8) || new Set(picked).size !== 3) {
    return { points: -1, verdict: 'нужно три разных числа от 1 до 9 или gyul' }
  }
  const key = picked.join(',')
  if (given.includes(key)) return { points: -1, verdict: 'этот хап уже называли' }
  if (!isHap(board[picked[0]], board[picked[1]], board[picked[2]])) {
    return { points: -1, verdict: 'это не хап' }
  }
  game.usedHaps = { ...game.usedHaps, [index]: [...given, key] }
  return { points: 1, verdict: 'хап засчитан' }
}

/** The tile battle resolves as soon as both players have put one up. */
function resolveBattle(game: ChGame, round: number): void {
  const index = bwBattleIndex(round)
  const played: Record<string, number> = {}
  for (const player of duelists(game)) {
    // the grader already decided what the answer was worth, text and all
    played[player] = entryFor(game, round, 'bw', player)?.value ?? 0
  }
  const [a, b] = duelists(game)
  const winner = played[a] === played[b] ? null : played[a] > played[b] ? a : b
  game.bwBattles = [...game.bwBattles.filter(x => x.round !== round), { round, played, winner }]
  if (winner) game.bwFirst = winner
  log(game, `Плитки раунда ${round}: ${a} ${played[a]} против ${b} ${played[b]}` +
    `${winner ? `, забирает ${winner}` : ', ничья'}`)
  void index
}

function gradeBw(
  game: ChGame, round: number, player: string, text: string,
): { points: number; verdict: string; value: number } {
  const tile = Number(text.trim())
  const hand = game.bwHand[player] ?? []
  // an unusable answer is taken as a zero, exactly as the rules say
  const played = Number.isInteger(tile) && hand.includes(tile) ? tile : 0
  game.bwHand = { ...game.bwHand, [player]: hand.filter(t => t !== played) }
  return { points: 0, verdict: `плитка ${played} выставлена`, value: played }
}

/**
 * Takes one answer in one channel. Only the first post of a round counts, and
 * a second one costs a point.
 */
export function submit(
  game: ChGame, player: string, channel: Channel, text: string, now = Date.now(),
): ChGame {
  const round = roundAt(game, now)
  if (round == null) return game

  if (entryFor(game, round, channel, player)) {
    award(game, player, -1)
    log(game, `${player} написал в ${CHANNEL_NAMES[channel]} второй раз за раунд ${round}: минус очко.`)
    return game
  }

  let graded: { points: number; verdict: string; value?: number }
  if (channel === 'five') graded = gradeFive(game, round, text)
  else if (channel === 'integer') graded = gradeInteger(game, round, text)
  else if (channel === 'animal') graded = gradeAnimal(game, round, text)
  else if (channel === 'collection') graded = gradeCollection(game, round, text)
  else if (channel === 'gyulhap') graded = gradeGyulHap(game, round, text)
  else graded = gradeBw(game, round, player, text)

  store(game, round, channel, player, {
    at: new Date(now).toISOString(),
    text,
    points: graded.points,
    verdict: graded.verdict,
    ...(graded.value != null ? { value: graded.value } : {}),
  })
  if (graded.points !== 0) award(game, player, graded.points)

  if (channel === 'bw' && duelists(game).every(p => entryFor(game, round, 'bw', p))) {
    resolveBattle(game, round)
  }
  return game
}

// ---------- starting and finishing ----------

export function startGame(game: ChGame, now = Date.now()): ChGame {
  game.startedAt = new Date(now).toISOString()
  game.finishedAt = null
  game.points = Object.fromEntries(duelists(game).map(p => [p, 0]))
  game.bwHand = Object.fromEntries(duelists(game).map(p => [p, [...BW_TILES]]))
  game.boards = Array.from({ length: Math.ceil(ROUNDS / 3) }, () => makeBoard())
  game.usedCollection = []
  game.usedHaps = {}
  game.bwBattles = []
  log(game, 'Игра началась.')
  return game
}

export function bwWinner(game: ChGame): string | null {
  const wins: Record<string, number> = {}
  for (const battle of game.bwBattles) {
    if (battle.winner) wins[battle.winner] = (wins[battle.winner] ?? 0) + 1
  }
  const [a, b] = duelists(game)
  const left = wins[a] ?? 0
  const right = wins[b] ?? 0
  return left === right ? null : left > right ? a : b
}

/**
 * Adds the black and white prize and names a winner. A dead heat goes to the
 * black and white winner, and then to whoever holds the advantage.
 */
export function finishGame(game: ChGame, now = Date.now()): ChGame {
  if (game.finishedAt) return game

  // any battle where somebody stayed silent still has to resolve
  for (let round = 1; round <= ROUNDS; round += 2) {
    if (!game.bwBattles.some(b => b.round === round)) resolveBattle(game, round)
  }

  const champion = bwWinner(game)
  if (champion) {
    award(game, champion, BW_PRIZE)
    log(game, `Black and White забирает ${champion}: плюс ${BW_PRIZE} очков.`)
  }
  game.finishedAt = new Date(now).toISOString()
  log(game, `Итог: ${duelists(game).map(p => `${p} ${game.points[p] ?? 0}`).join(', ')}`)
  return game
}

export function winnerOf(game: ChGame): string | null {
  if (!game.finishedAt) return null
  const [a, b] = duelists(game)
  const left = game.points[a] ?? 0
  const right = game.points[b] ?? 0
  if (left !== right) return left > right ? a : b
  return bwWinner(game) ?? game.advantage
}

export function applyClock(game: ChGame, now = Date.now()): ChGame {
  if (!game.startedAt || game.finishedAt) return game
  const over = now >= new Date(game.startedAt).getTime() + ROUNDS * ROUND_MS
  return over ? finishGame(game, now) : game
}

// ---------- what a viewer sees ----------

export interface ChView {
  id: string
  name: string
  ec: string | null
  opponent: string | null
  advantage: string | null
  started: boolean
  finished: boolean
  round: number | null
  roundEndsAt: number | null
  /** what each channel is asking this round */
  prompts: {
    five: string[] | null
    integer: string | null
    animal: string | null
    collection: string | null
    board: Card[] | null
    bwDue: boolean
  }
  myAnswers: Record<string, ChSubmission | null>
  points: Record<string, number>
  myTiles: number[]
  bwBattles: { round: number; played: Record<string, number>; winner: string | null }[]
  winner: string | null
  isDuelist: boolean
  contentReady: boolean
  log: { at: string; text: string }[]
}

export function viewFor(game: ChGame, username: string, isAdmin: boolean): ChView {
  const round = roundAt(game)
  const isDuelist = duelists(game).includes(username)
  const board = round ? game.boards[boardIndex(round)] ?? null : null
  const collection = round ? game.content.collections[collectionIndex(round)] ?? null : null

  const myAnswers: Record<string, ChSubmission | null> = {}
  for (const channel of CHANNELS) {
    myAnswers[channel] = round ? entryFor(game, round, channel, username) : null
  }

  return {
    id: game.id,
    name: game.name,
    ec: game.ec,
    opponent: game.opponent,
    advantage: game.advantage,
    started: !!game.startedAt,
    finished: !!game.finishedAt,
    round,
    roundEndsAt: round ? roundEndsAt(game, round) : null,
    prompts: {
      five: round ? game.content.five[round - 1]?.clues ?? null : null,
      integer: round ? game.content.integer[round - 1]?.question ?? null : null,
      animal: round ? game.content.animal[round - 1]?.question ?? null : null,
      collection: collection?.category ?? null,
      board,
      bwDue: round ? isBwRound(round) : false,
    },
    myAnswers,
    // the score is public, which is what makes the last minutes interesting
    points: game.points,
    myTiles: isDuelist ? (game.bwHand[username] ?? []) : [],
    bwBattles: game.bwBattles,
    winner: winnerOf(game),
    isDuelist,
    contentReady:
      game.content.five.length >= ROUNDS &&
      game.content.integer.length >= ROUNDS &&
      game.content.animal.length >= ROUNDS &&
      game.content.collections.length >= COLLECTION_ROUNDS.length,
    log: isAdmin || game.finishedAt ? game.log : [],
  }
}
