import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const PRESENCE_PATH = join(process.cwd(), 'presence.json')
const ONLINE_TTL = 60 * 1000 // 60 seconds

type PresenceMap = Record<string, number>

function read(): PresenceMap {
  if (!existsSync(PRESENCE_PATH)) return {}
  try { return JSON.parse(readFileSync(PRESENCE_PATH, 'utf-8')) } catch { return {} }
}

function write(data: PresenceMap) {
  writeFileSync(PRESENCE_PATH, JSON.stringify(data), 'utf-8')
}

export function ping(username: string): void {
  const data = read()
  data[username] = Date.now()
  write(data)
}

export function getOnline(): string[] {
  const data = read()
  const cutoff = Date.now() - ONLINE_TTL
  return Object.entries(data)
    .filter(([, ts]) => ts > cutoff)
    .map(([username]) => username)
}
