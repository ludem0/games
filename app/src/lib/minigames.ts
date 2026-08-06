import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getDefaultRoundLayouts } from './trackTroubleLayouts'

const MINIGAMES_PATH = join(process.cwd(), 'minigames.json')

export interface MinecartChain {
  id: string
  capacity: number
  color: string
  destination: string
  points: number
  departsTo: 'north' | 'south'
}

export interface TrackSwitch {
  id: string
  color: string
  side: 'north' | 'south' | 'both'  // bank(s) a player must stand on to pull the lever
  active: boolean
  swapsTrackIds: string[]   // ≥2 paths toggled together
  anchorTrackId?: string    // track the node sits on; default = centroid of involved
  crossing?: boolean        // render as X-cross (node per track, colored arms cross) instead of fork
  y?: number                // override switch node Y coordinate
  noLever?: boolean         // don't render a lever token for this switch
  plain?: boolean           // simple connector: plain black line, no node, no lever
  leverAt?: string          // track id whose column hosts the lever (usually a spacer/floating slot)
  leverAtNorth?: string     // with side 'both' the two levers may sit in different columns
  leverAtSouth?: string
  armTop?: number           // absolute Y where the upward arms end; default = node Y − FORK_H
  mergeTracks?: string[]    // tracks joined by the black fan below the node; default = swapsTrackIds
  mergeY?: number           // fan endpoint Y; if omitted, each arm lands on that track's wagon stack
  activeTrackId?: string    // arm the lever starts on; default = anchor
  activeArm?: number        // index into swapsTrackIds; set once the lever has been pulled
  armDir?: 1 | -1           // levers with 3+ arms swing back and forth: 1→2→3→2→1
}

export interface Track {
  id: string
  color: string
  chains: MinecartChain[]
  isGreyed: boolean
  isFloating?: boolean  // destination-only path: no start wagons, no bottom letter label
  isSpacer?: boolean    // empty grid column: renders nothing, only holds a slot (e.g. for a lever)
}

export interface RoundLayout {
  tracks: Track[]
  switches: TrackSwitch[]
  peekUnlocked: boolean
}

export type SubmissionAction =
  | { type: 'board'; chainId: string; trackId: string }
  | { type: 'switch'; switchId: string }
  | { type: 'stay' }

export interface PlayerSubmission {
  username: string
  crossingNumber: 1 | 2
  action: SubmissionAction
  submittedAt: string
}

export interface CrossingResult {
  crossingNumber: 1 | 2
  resolvedAt: string
  departedChainIds: string[]
  pointsAwarded: Record<string, number>
  playerPositions: Record<string, 'north' | 'south'>
  psigemGrants: Record<string, number>
  activatedSwitchIds: string[]
}

export interface MinecartRound {
  roundNumber: number
  layout: RoundLayout
  phase: 'pending' | 'crossing1_open' | 'crossing2_open' | 'complete'
  phaseDeadline: string | null
  submissions: PlayerSubmission[]
  results: CrossingResult[]
  availableChainsForCrossing2: string[]
}

export interface MinigameData {
  id: string
  seasonSlug: string
  name: string
  status: 'setup' | 'active' | 'finished'
  participants: string[]
  rounds: MinecartRound[]
  totalPoints: Record<string, number>
  psigemBalance: Record<string, number>
  peeks: Record<string, number[]>
  rewardsDistributed: boolean
  createdAt: string
}

function readAll(): Record<string, MinigameData> {
  if (!existsSync(MINIGAMES_PATH)) return {}
  try {
    return JSON.parse(readFileSync(MINIGAMES_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, MinigameData>): void {
  writeFileSync(MINIGAMES_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getAllMinigames(): Record<string, MinigameData> {
  return readAll()
}

export function getMinigame(slug: string): MinigameData | null {
  return readAll()[slug] ?? null
}

export function saveMinigame(slug: string, data: MinigameData): void {
  const all = readAll()
  all[slug] = data
  writeAll(all)
}

export function deleteMinigame(slug: string): void {
  const all = readAll()
  delete all[slug]
  writeAll(all)
}

// Games belong to a season match, so the slug is derived instead of typed by hand.
export function seasonGameSlug(seasonSlug: string, matchId: string): string {
  return `${seasonSlug}-${matchId}`
}

// Every main match is a round of Track Trouble, laid out and ready to run.
export function createSeasonGame(
  slug: string,
  seasonSlug: string,
  name: string,
  participants: string[],
): MinigameData {
  const existing = getMinigame(slug)
  if (existing) return existing

  const layouts = getDefaultRoundLayouts()
  const game: MinigameData = {
    id: slug,
    seasonSlug,
    name,
    status: 'setup',
    participants,
    rounds: layouts.map((layout, i) => ({ ...createEmptyRound(i + 1), layout })),
    totalPoints: Object.fromEntries(participants.map(p => [p, 0])),
    psigemBalance: Object.fromEntries(participants.map(p => [p, 0])),
    peeks: {},
    rewardsDistributed: false,
    createdAt: new Date().toISOString(),
  }
  saveMinigame(slug, game)
  return game
}

// The season owns the roster, so the game follows it.
export function syncParticipants(slug: string, participants: string[]): MinigameData | null {
  const game = getMinigame(slug)
  if (!game) return null
  // an empty roster means the season has none yet, not that the game lost its players
  if (participants.length === 0) return game
  const same = game.participants.length === participants.length
    && game.participants.every(p => participants.includes(p))
  if (same) return game

  const updated: MinigameData = {
    ...game,
    participants,
    totalPoints: Object.fromEntries(participants.map(p => [p, game.totalPoints[p] ?? 0])),
    psigemBalance: Object.fromEntries(participants.map(p => [p, game.psigemBalance[p] ?? 0])),
  }
  saveMinigame(slug, updated)
  return updated
}

export function createEmptyRound(roundNumber: number): MinecartRound {
  return {
    roundNumber,
    layout: { tracks: [], switches: [], peekUnlocked: false },
    phase: 'pending',
    phaseDeadline: null,
    submissions: [],
    results: [],
    availableChainsForCrossing2: [],
  }
}

export function getCurrentCrossingNumber(round: MinecartRound): 1 | 2 | null {
  if (round.phase === 'crossing1_open') return 1
  if (round.phase === 'crossing2_open') return 2
  return null
}

export function getPlayerPosition(
  round: MinecartRound,
  username: string,
  crossingNumber: 1 | 2
): 'north' | 'south' {
  if (crossingNumber === 1) return 'south'
  const prev = round.results.find(r => r.crossingNumber === 1)
  return prev?.playerPositions[username] ?? 'south'
}

// compute psigem grants for a crossing given before/after totals
export function computePsigemGrants(
  before: Record<string, number>,
  awarded: Record<string, number>
): Record<string, number> {
  const grants: Record<string, number> = {}
  for (const [username, pts] of Object.entries(awarded)) {
    const b = before[username] ?? 0
    const after = b + pts
    const g = Math.floor(after / 10) - Math.floor(b / 10)
    if (g > 0) grants[username] = g
  }
  return grants
}
