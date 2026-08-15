import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// One place that knows every turn-based game on the site. The dashboard block,
// and the Telegram notifier both lean on this scan instead of asking each
// engine separately, so a future game joins them by adding one line here.

interface Entry { file: string; url: string }

// Simultaneous games (rooms, possession, the cube, ...) have no single "turn"
// and are left out: there is nobody specific to nudge.
const REGISTRY: Entry[] = [
  { file: 'letterbox.json', url: '/letterbox' },
  { file: 'ultimate.json', url: '/ultimate' },
  { file: 'swapping.json', url: '/swapping' },
  { file: 'pathing.json', url: '/pathing' },
  { file: 'dominobw.json', url: '/dominobw' },
  { file: 'fieldtactics.json', url: '/fieldtactics' },
  { file: 'numberjanggi.json', url: '/numberjanggi' },
  { file: 'conveyor.json', url: '/conveyor' },
  { file: 'tugofwar.json', url: '/tugofwar' },
  { file: 'element.json', url: '/element' },
  { file: 'labyrinth.json', url: '/labyrinth' },
  { file: 'domain.json', url: '/domain' },
]

export interface TurnEntry {
  /** game id, unique across files because it embeds season and match */
  slug: string
  name: string
  url: string
  player: string
}

interface RawGame {
  id?: string
  name?: string
  phase?: string
  winner?: string | null
  turn?: string | null
  draftTurn?: string | null
}

/** Every game where somebody specific is expected to move right now. */
export function scanTurns(): TurnEntry[] {
  const out: TurnEntry[] = []
  for (const { file, url } of REGISTRY) {
    const path = join(process.cwd(), file)
    if (!existsSync(path)) continue
    let all: Record<string, RawGame>
    try { all = JSON.parse(readFileSync(path, 'utf-8')) } catch { continue }

    for (const game of Object.values(all)) {
      if (!game?.id || game.winner || game.phase === 'finished') continue
      const player = game.turn ?? game.draftTurn
      if (typeof player !== 'string' || !player) continue
      out.push({
        slug: game.id,
        name: game.name ?? game.id,
        url: `${url}/${game.id}`,
        player,
      })
    }
  }
  return out
}
