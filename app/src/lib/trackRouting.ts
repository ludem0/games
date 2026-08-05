import type { RoundLayout, TrackSwitch } from './minigames'

// Pure layout logic — no file access, so client components can use it too.

// Which arm the lever currently points at. Layouts declare the starting arm by id;
// once a lever has been pulled the index is stored on the switch.
export function activeArmIndex(sw: TrackSwitch): number {
  if (sw.activeArm != null) return sw.activeArm
  const byId = sw.activeTrackId ? sw.swapsTrackIds.indexOf(sw.activeTrackId) : -1
  if (byId >= 0) return byId
  const byAnchor = sw.anchorTrackId ? sw.swapsTrackIds.indexOf(sw.anchorTrackId) : -1
  return byAnchor >= 0 ? byAnchor : 0
}

// A pull moves the arm one step and bounces off the ends: 1→2→3→2→1→2…
export function pullLever(sw: TrackSwitch): void {
  const n = sw.swapsTrackIds.length
  if (n < 2) return
  const i = activeArmIndex(sw)
  let dir: 1 | -1 = sw.armDir ?? 1
  if (i + dir < 0 || i + dir > n - 1) dir = dir === 1 ? -1 : 1
  sw.activeArm = i + dir
  sw.armDir = dir
}

// The node a cart leaving this track runs into first (the one closest to the wagons).
function feederSwitch(layout: RoundLayout, trackId: string, seen: Set<string>): TrackSwitch | null {
  const feeders = layout.switches.filter(s => {
    if (seen.has(s.id) || s.plain) return false
    const joins = s.mergeTracks ?? (s.anchorTrackId ? [s.anchorTrackId] : [])
    return joins.includes(trackId)
  })
  if (feeders.length === 0) return null
  return feeders.reduce((a, b) => ((b.y ?? 0) > (a.y ?? 0) ? b : a))
}

// Points a cart earns from a track: follow the active arms upward until a box is reached.
export function destinationPoints(layout: RoundLayout, trackId: string): number {
  const ownPoints = (id: string) =>
    layout.tracks.find(t => t.id === id)?.chains[0]?.points ?? 0

  const seen = new Set<string>()
  let current = trackId
  for (let step = 0; step <= layout.switches.length; step++) {
    const sw = feederSwitch(layout, current, seen)
    if (!sw) return ownPoints(current)
    seen.add(sw.id)
    // An arm pointing back at the column the cart came from means it carries straight
    // on upward, where a further node may still be waiting.
    const target = sw.swapsTrackIds[activeArmIndex(sw)]
    if (target) current = target
  }
  return ownPoints(current)
}
