import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

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
  side: 'north' | 'south'
  active: boolean
  swapsTrackIds: string[]   // ≥2 paths toggled together
  anchorTrackId?: string    // track the node sits on; default = centroid of involved
  crossing?: boolean        // render as X-cross (node per track, colored arms cross) instead of fork
  y?: number                // override switch node Y coordinate
}

export interface Track {
  id: string
  color: string
  chains: MinecartChain[]
  isGreyed: boolean
  isFloating?: boolean  // destination-only path: no start wagons, no bottom letter label
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
