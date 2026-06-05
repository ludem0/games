import type { RoundLayout, Track, MinecartChain, TrackSwitch } from './minigames'

// Reference layouts for the 9 rounds of "Track Trouble", authored to match
// the admin's 9 reference images. One chain per track: points = number in the
// top box, capacity = number of stacked wagons. Switches toggle isGreyed on
// their tracks; lever marker is derived from switch.side + switch.color.

const PURPLE = '#7c3aed'
const PINK = '#ec4899'
const CYAN = '#06b6d4'

function ch(id: string, points: number, capacity: number): MinecartChain {
  return { id, capacity, color: '#9aa0a6', destination: '', points, departsTo: 'north' }
}
function tr(id: string, points: number | null, capacity: number, isGreyed = false, isFloating = false): Track {
  return { id, color: '#1a1a1a', chains: points == null ? [] : [ch(`${id}c`, points, capacity)], isGreyed, isFloating }
}
function sw(
  id: string, color: string, side: 'north' | 'south',
  swapsTrackIds: string[], anchorTrackId: string, crossing = false,
): TrackSwitch {
  return { id, color, side, active: true, swapsTrackIds, anchorTrackId, crossing }
}

// helper to build a round from letter specs
function round(
  r: number,
  tracks: { points: number | null; cap: number; grey?: boolean; floating?: boolean }[],
  switches: { color: string; side: 'north' | 'south'; tracks: number[]; anchor: number; cross?: boolean }[],
): RoundLayout {
  const id = (i: number) => `r${r}${String.fromCharCode(65 + i)}`
  return {
    tracks: tracks.map((t, i) => tr(id(i), t.points, t.cap, t.grey, t.floating)),
    switches: switches.map((s, si) =>
      sw(`r${r}s${si}`, s.color, s.side, s.tracks.map(id), id(s.anchor), s.cross ?? false)),
    peekUnlocked: false,
  }
}

export function getDefaultRoundLayouts(): RoundLayout[] {
  return [
    // R1: A(4), B(3), C(2→5float), D(2), E(3); purple south switches A↔B and C↔floating
    round(1,
      [
        { points: 4, cap: 3 },                    // A
        { points: 3, cap: 3 },                    // B
        { points: 2, cap: 3 },                    // C
        { points: 5, cap: 0, floating: true },    // floating (only reachable via C switch)
        { points: 2, cap: 2 },                    // D
        { points: 3, cap: 1 },                    // E
      ],
      [{ color: PURPLE, side: 'south', tracks: [0, 1], anchor: 0 },   // A↔B
       { color: PURPLE, side: 'south', tracks: [2, 3], anchor: 2 }]), // C↔floating

    // R2: A(4)↔B(2) purple north fork; D(5)↔C(1,floating) purple south fork; E(3) plain.
    round(2,
      [
        { points: 4, cap: 2 },                    // A
        { points: 2, cap: 2 },                    // B
        { points: 1, cap: 0, floating: true },    // C floating (only via D switch)
        { points: 5, cap: 2 },                    // D
        { points: 3, cap: 4 },                    // E
      ],
      [{ color: PURPLE, side: 'north', tracks: [0, 1], anchor: 0 },   // A↔B, lever north
       { color: PURPLE, side: 'south', tracks: [3, 2], anchor: 3 }]), // D↔C(floating), lever south
       

    // R3: 6 tracks, no switches, F has tall stack
    round(3,
      [{ points: 3, cap: 2 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 5, cap: 7 }],
      []),

    // R4: 6 tracks, three purple X-crossings (A↔B, C↔D, E↔F), levers north
    round(4,
      [{ points: 2, cap: 3 }, { points: 4, cap: 2 }, { points: 2, cap: 2 }, { points: 4, cap: 1 }, { points: 2, cap: 2 }, { points: 4, cap: 1 }],
      [{ color: PURPLE, side: 'north', tracks: [0, 1], anchor: 0, cross: true },
       { color: PURPLE, side: 'north', tracks: [2, 3], anchor: 2, cross: true },
       { color: PURPLE, side: 'north', tracks: [4, 5], anchor: 4, cross: true }]),

    // R5: 5 tracks, one pink 3-way star fork (B,C,D), lever both
    round(5,
      [{ points: 2, cap: 3 }, { points: 1, cap: 3 }, { points: 6, cap: 3 }, { points: 4, cap: 3 }, { points: 3, cap: 4 }],
      [{ color: PINK, side: 'south', tracks: [1, 2, 3], anchor: 2 }]),

    // R6: 6 tracks, three down-forks (purple A↔B, purple C↔D, cyan E↔F), levers south
    round(6,
      [{ points: 2, cap: 3 }, { points: 6, cap: 1 }, { points: 3, cap: 3 }, { points: 4, cap: 1 }, { points: 1, cap: 3 }, { points: 5, cap: 1 }],
      [{ color: PURPLE, side: 'south', tracks: [0, 1], anchor: 0 },
       { color: PINK, side: 'south', tracks: [2, 3], anchor: 2 },
       { color: CYAN, side: 'south', tracks: [4, 5], anchor: 4 }]),

    // R7: 6 tracks, multi-arm forks (purple A→A,B,C ; purple D→D,E ; cyan F→E,F)
    round(7,
      [{ points: 2, cap: 3 }, { points: 3, cap: 2 }, { points: 1, cap: 1 }, { points: 4, cap: 3 }, { points: 6, cap: 2 }, { points: 2, cap: 3 }],
      [{ color: PURPLE, side: 'south', tracks: [0, 1, 2], anchor: 0 },
       { color: PURPLE, side: 'south', tracks: [3, 4], anchor: 3 },
       { color: CYAN, side: 'south', tracks: [4, 5], anchor: 5 }]),

    // R8: 5 tracks, one purple staircase fork (A..E), lever north
    round(8,
      [{ points: 2, cap: 5 }, { points: 4, cap: 4 }, { points: 2, cap: 3 }, { points: 2, cap: 2 }, { points: 6, cap: 1 }],
      [{ color: PURPLE, side: 'north', tracks: [0, 1, 2, 3, 4], anchor: 1 }]),

    // R9: 6 tracks, three colored down-forks (purple A↔B, pink C↔D, cyan E↔F)
    round(9,
      [{ points: 2, cap: 3 }, { points: 6, cap: 1 }, { points: 3, cap: 3 }, { points: 4, cap: 1 }, { points: 1, cap: 3 }, { points: 5, cap: 1 }],
      [{ color: PURPLE, side: 'south', tracks: [0, 1], anchor: 0 },
       { color: PINK, side: 'south', tracks: [2, 3], anchor: 2 },
       { color: CYAN, side: 'south', tracks: [4, 5], anchor: 4 }]),
  ]
}
