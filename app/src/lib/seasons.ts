import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SEASONS_PATH = join(process.cwd(), 'seasons.json')

export interface LeaderboardRow { username: string; values: number[] }
export interface Leaderboard { columns: string[]; rows: LeaderboardRow[] }
export interface SeasonData { participants: string[]; leaderboard: Leaderboard }

const EMPTY_SEASON: SeasonData = { participants: [], leaderboard: { columns: [], rows: [] } }

function readAll(): Record<string, SeasonData> {
  try {
    const raw = JSON.parse(readFileSync(SEASONS_PATH, 'utf-8'))
    // migrate old format: { simply: string[] } → { simply: SeasonData }
    const result: Record<string, SeasonData> = {}
    for (const [slug, val] of Object.entries(raw)) {
      if (Array.isArray(val)) {
        result[slug] = { participants: val as string[], leaderboard: { columns: [], rows: [] } }
      } else {
        result[slug] = val as SeasonData
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
  const newRow: LeaderboardRow = { username, values: season.leaderboard.columns.map(() => 0) }
  saveSeason(slug, {
    participants: [...season.participants, username],
    leaderboard: {
      ...season.leaderboard,
      rows: [...season.leaderboard.rows, newRow],
    },
  })
}

export function removeParticipant(slug: string, username: string): void {
  const season = getSeason(slug)
  saveSeason(slug, {
    participants: season.participants.filter(u => u !== username),
    leaderboard: {
      ...season.leaderboard,
      rows: season.leaderboard.rows.filter(r => r.username !== username),
    },
  })
}

export function getLeaderboard(slug: string): Leaderboard {
  return getSeason(slug).leaderboard
}

export function saveLeaderboard(slug: string, leaderboard: Leaderboard): void {
  const season = getSeason(slug)
  saveSeason(slug, { ...season, leaderboard })
}
