import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SEASONS_PATH = join(process.cwd(), 'seasons.json')

function getSeasons(): Record<string, string[]> {
  try {
    return JSON.parse(readFileSync(SEASONS_PATH, 'utf-8'))
  } catch {
    return { simply: [], zero: [], gambit: [] }
  }
}

function saveSeasons(data: Record<string, string[]>): void {
  writeFileSync(SEASONS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getParticipants(slug: string): string[] {
  return getSeasons()[slug] ?? []
}

export function addParticipant(slug: string, username: string): void {
  const data = getSeasons()
  const list = data[slug] ?? []
  if (!list.includes(username)) {
    data[slug] = [...list, username]
    saveSeasons(data)
  }
}

export function removeParticipant(slug: string, username: string): void {
  const data = getSeasons()
  data[slug] = (data[slug] ?? []).filter(u => u !== username)
  saveSeasons(data)
}
