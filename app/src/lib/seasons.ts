import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SEASONS_PATH = join(process.cwd(), 'seasons.json')

export interface MainMatch {
  name: string
  participants: string[]
  winners: string[]
  losers: string[]
}

export interface DeathMatch {
  name: string
  participants: string[]
  winner: string
  eliminated: string
}

export interface Round {
  id: string
  number: number
  mainMatch: MainMatch
  deathMatch: DeathMatch | null
}

export interface SeasonData {
  participants: string[]
  ranks: string[]
  rounds: Round[]
}

const EMPTY_SEASON: SeasonData = { participants: [], ranks: [], rounds: [] }

function readAll(): Record<string, SeasonData> {
  try {
    const raw = JSON.parse(readFileSync(SEASONS_PATH, 'utf-8'))
    const result: Record<string, SeasonData> = {}
    for (const [slug, val] of Object.entries(raw)) {
      if (Array.isArray(val)) {
        result[slug] = { participants: val as string[], ranks: [], rounds: [] }
      } else {
        const v = val as Record<string, unknown>
        result[slug] = {
          participants: (v.participants as string[]) ?? [],
          ranks: (v.ranks as string[]) ?? [],
          rounds: (v.rounds as Round[]) ?? [],
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

export function getParticipants(slug: string): string[] {
  return getSeason(slug).participants
}

export function addParticipant(slug: string, username: string): void {
  const season = getSeason(slug)
  if (season.participants.includes(username)) return
  saveSeason(slug, { ...season, participants: [...season.participants, username] })
}

export function removeParticipant(slug: string, username: string): void {
  const season = getSeason(slug)
  saveSeason(slug, {
    ...season,
    participants: season.participants.filter(u => u !== username),
    ranks: season.ranks.filter(u => u !== username),
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
