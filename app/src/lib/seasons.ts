import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SEASONS_PATH = join(process.cwd(), 'seasons.json')

export interface MMGameColumn {
  name: string
  points?: Record<string, number>
}

export interface MMGame {
  name: string
  columnName?: string
  points?: Record<string, number>
  columns?: MMGameColumn[]
}

export interface MainMatch {
  name: string
  participants: string[]
  winners: string[]
  losers: string[]
  points?: Record<string, number>
  columnName?: string
  games?: MMGame[]
}

export interface DMRound {
  name: string
  columns?: MMGameColumn[]
}

export interface DeathMatch {
  name: string
  participants: string[]
  winner: string
  eliminated: string
  points?: Record<string, number>
  columnName?: string
  rounds?: DMRound[]
}

export interface FinalGame {
  name: string
  winner: string
  points?: Record<string, number>
  columnName?: string
}

export interface Round {
  id: string
  number: number
  type?: 'final'
  mainMatch: MainMatch
  deathMatch: DeathMatch | null
  deathMatches?: DeathMatch[]
  finalGames?: FinalGame[]
  mmPsigemDelta?: Record<string, number>
}

export interface Match {
  id: string
  type: 'main' | 'death'
  name: string
  visible: boolean
  accessible: boolean
  minigameSlug?: string
  game?: 'track_trouble' | 'double_team' | 'letterbox' | 'ultimate_ttt'
  running?: boolean                          // admin started it and has not ended it
  frozenPsigems?: Record<string, number>     // standings captured when it started
  frozenRounds?: Round[]
}

export interface SeasonData {
  participants: string[]
  ranks: string[]
  rounds: Round[]
  psigems: Record<string, number>
  opals?: Record<string, number>
  matches?: Match[]
}

const EMPTY_SEASON: SeasonData = { participants: [], ranks: [], rounds: [], psigems: {}, matches: [] }

function readAll(): Record<string, SeasonData> {
  try {
    const raw = JSON.parse(readFileSync(SEASONS_PATH, 'utf-8'))
    const result: Record<string, SeasonData> = {}
    for (const [slug, val] of Object.entries(raw)) {
      if (Array.isArray(val)) {
        result[slug] = { participants: val as string[], ranks: [], rounds: [], psigems: {} }
      } else {
        const v = val as Record<string, unknown>
        result[slug] = {
          participants: (v.participants as string[]) ?? [],
          ranks: (v.ranks as string[]) ?? [],
          rounds: (v.rounds as Round[]) ?? [],
          psigems: (v.psigems as Record<string, number>) ?? {},
          opals: (v.opals as Record<string, number>) ?? {},
          matches: (v.matches as Match[]) ?? [],
        }
      }
    }
    return result
  } catch {
    return { simply: { ...EMPTY_SEASON }, zero: { ...EMPTY_SEASON }, gambit: { ...EMPTY_SEASON } }
  }
}

function writeAll(data: Record<string, SeasonData>): void {
  writeFileSync(SEASONS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function getSeason(slug: string): SeasonData {
  return readAll()[slug] ?? { ...EMPTY_SEASON }
}

function saveSeason(slug: string, data: SeasonData): void {
  const all = readAll()
  all[slug] = data
  writeAll(all)
}

export function getAllSeasons(): Record<string, SeasonData> {
  return readAll()
}

export function getParticipants(slug: string): string[] {
  return getSeason(slug).participants
}

export function addParticipant(slug: string, username: string): void {
  const season = getSeason(slug)
  if (season.participants.includes(username)) return
  saveSeason(slug, {
    ...season,
    participants: [...season.participants, username],
    psigems: { ...season.psigems, [username]: season.psigems[username] ?? 1 },
  })
}

export function removeParticipant(slug: string, username: string): void {
  const season = getSeason(slug)
  const { [username]: _, ...restPsigems } = season.psigems
  saveSeason(slug, {
    ...season,
    participants: season.participants.filter(u => u !== username),
    ranks: season.ranks.filter(u => u !== username),
    psigems: restPsigems,
  })
}

export function getRanks(slug: string): string[] {
  return getSeason(slug).ranks
}

export function saveRanks(slug: string, ranks: string[]): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, ranks })
}

export function getRounds(slug: string): Round[] {
  return getSeason(slug).rounds
}

export function saveRounds(slug: string, rounds: Round[]): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, rounds })
}

export function getPsigems(slug: string): Record<string, number> {
  return getSeason(slug).psigems
}

export function savePsigems(slug: string, psigems: Record<string, number>): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, psigems })
}

export function getOpals(slug: string): Record<string, number> {
  return getSeason(slug).opals ?? {}
}

export function saveOpals(slug: string, opals: Record<string, number>): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, opals })
}

export function getMatches(slug: string): Match[] {
  return getSeason(slug).matches ?? []
}

export function saveMatches(slug: string, matches: Match[]): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, matches })
}

// A running match freezes the standings: while it lasts, players keep seeing the
// snapshot taken when it started. The admin always sees the live data.
export function getRunningMatch(slug: string, type?: 'main' | 'death'): Match | null {
  const running = getMatches(slug).filter(m => m.running)
  const match = type ? running.find(m => m.type === type) : running[0]
  return match ?? null
}

export function startMatch(slug: string, id: string): Match | null {
  const season = getSeason(slug)
  const matches = (season.matches ?? []).map(m =>
    m.id === id
      ? { ...m, running: true, frozenPsigems: { ...season.psigems }, frozenRounds: season.rounds }
      : m)
  saveSeason(slug, { ...season, matches })
  return matches.find(m => m.id === id) ?? null
}

export function stopMatch(slug: string, id: string): Match | null {
  const season = getSeason(slug)
  const matches = (season.matches ?? []).map(m => {
    if (m.id !== id) return m
    const { frozenPsigems: _p, frozenRounds: _r, ...rest } = m
    return { ...rest, running: false }
  })
  saveSeason(slug, { ...season, matches })
  return matches.find(m => m.id === id) ?? null
}

// What the leaderboard should be built from for this viewer.
export function getStandingsView(slug: string, isAdmin: boolean): {
  psigems: Record<string, number>
  rounds: Round[]
  frozenBy: string | null
} {
  const season = getSeason(slug)
  const running = (season.matches ?? []).find(m => m.running)
  if (isAdmin || !running || !running.frozenPsigems) {
    return { psigems: season.psigems, rounds: season.rounds, frozenBy: null }
  }
  return {
    psigems: running.frozenPsigems,
    rounds: running.frozenRounds ?? season.rounds,
    frozenBy: running.visible ? running.name : 'матч',
  }
}
