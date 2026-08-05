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
function tr(id: string, points: number | null, capacity: number, isGreyed = false, isFloating = false, isSpacer = false): Track {
  return { id, color: '#1a1a1a', chains: points == null ? [] : [ch(`${id}c`, points, capacity)], isGreyed, isFloating, isSpacer }
}
interface SwitchOpts {
  crossing?: boolean
  y?: number
  noLever?: boolean
  plain?: boolean
  leverAt?: string
  leverAtNorth?: string
  leverAtSouth?: string
  armTop?: number
  mergeTracks?: string[]
  mergeY?: number
  activeTrackId?: string
}

function sw(
  id: string, color: string, side: 'north' | 'south' | 'both',
  swapsTrackIds: string[], anchorTrackId: string, o: SwitchOpts,
): TrackSwitch {
  return {
    id, color, side, active: true, swapsTrackIds, anchorTrackId, crossing: o.crossing ?? false,
    ...(o.y != null && { y: o.y }),
    ...(o.noLever && { noLever: o.noLever }),
    ...(o.plain && { plain: o.plain }),
    ...(o.leverAt && { leverAt: o.leverAt }),
    ...(o.leverAtNorth && { leverAtNorth: o.leverAtNorth }),
    ...(o.leverAtSouth && { leverAtSouth: o.leverAtSouth }),
    ...(o.armTop != null && { armTop: o.armTop }),
    ...(o.mergeTracks && { mergeTracks: o.mergeTracks }),
    ...(o.mergeY != null && { mergeY: o.mergeY }),
    ...(o.activeTrackId && { activeTrackId: o.activeTrackId }),
  }
}

// helper to build a round from letter specs
function round(
  r: number,
  tracks: { points: number | null; cap: number; grey?: boolean; floating?: boolean; spacer?: boolean }[],
  switches: {
    color?: string; side: 'north' | 'south' | 'both'; tracks: number[]; anchor: number
    cross?: boolean; y?: number; noLever?: boolean; plain?: boolean
    leverAt?: number; leverN?: number; leverS?: number
    armTop?: number; mergeY?: number; activeTrack?: number
    merge?: number[]
  }[],
): RoundLayout {
  const id = (i: number) => `r${r}${String.fromCharCode(65 + i)}`
  return {
    tracks: tracks.map((t, i) => tr(id(i), t.points, t.cap, t.grey, t.floating, t.spacer)),
    switches: switches.map((s, si) =>
      sw(`r${r}s${si}`, s.color ?? '#1a1a1a', s.side, s.tracks.map(id), id(s.anchor), {
        crossing: s.cross, y: s.y, noLever: s.noLever, plain: s.plain,
        armTop: s.armTop, mergeY: s.mergeY, mergeTracks: s.merge?.map(id),
        leverAt: s.leverAt != null ? id(s.leverAt) : undefined,
        leverAtNorth: s.leverN != null ? id(s.leverN) : undefined,
        leverAtSouth: s.leverS != null ? id(s.leverS) : undefined,
        activeTrackId: s.activeTrack != null ? id(s.activeTrack) : undefined,
      })),
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
        { points: 2, cap: 3 },                    // D
        { points: 3, cap: 1 },                    // E
      ],
      [{ color: PURPLE, side: 'south', tracks: [0, 1], anchor: 0, y: 265, leverAt: 3 },   // A↔B
       { color: PURPLE, side: 'south', tracks: [2, 3], anchor: 2, y: 265 }]),             // C↔floating

    // R2: A(4) B(2) C(1) D(5) [spacer with both levers] E(3).
    // Upper pair A/B: straight arm active, cross arms greyed — lever on the north bank.
    // Lower pair C/D: C leads to B by default and to D when flipped — lever on the south bank.
    round(2,
      [
        { points: 4, cap: 2 },
        { points: 2, cap: 2 },
        { points: 1, cap: 2 },
        { points: 5, cap: 2 },
        { points: null, cap: 0, spacer: true },
        { points: 3, cap: 4 },
      ],
      [{ color: PURPLE, side: 'north', tracks: [0, 1], anchor: 0, y: 262, leverAt: 4 },
       { color: PURPLE, side: 'north', tracks: [1, 0], anchor: 1, y: 262 },
       { color: PURPLE, side: 'south', tracks: [1, 3], anchor: 2, y: 380, leverAt: 4 },
       { color: PURPLE, side: 'south', tracks: [3, 2], anchor: 3, y: 380 }]),


    // R3: 6 tracks, no switches, F has tall stack
    round(3,
      [{ points: 3, cap: 2 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 2, cap: 1 }, { points: 5, cap: 7 }],
      []),

    // R4: spacer slot with the single north lever, then A–F in three crossed pairs
    round(4,
      [{ points: null, cap: 0, spacer: true },
       { points: 2, cap: 3 },
       { points: 4, cap: 2 },
       { points: 2, cap: 2 },
       { points: 4, cap: 1 },
       { points: 2, cap: 2 },
       { points: 4, cap: 1 }
      ],
      [{ color: PURPLE, side: 'north', tracks: [1, 2], anchor: 1, y: 237, leverAt: 0 },
       { color: PURPLE, side: 'north', tracks: [2, 1], anchor: 2, y: 237 },
       { color: PURPLE, side: 'north', tracks: [3, 4], anchor: 3, y: 237 },
       { color: PURPLE, side: 'north', tracks: [4, 3], anchor: 4, y: 237 },
       { color: PURPLE, side: 'north', tracks: [5, 6], anchor: 5, y: 237 },
       { color: PURPLE, side: 'north', tracks: [6, 5], anchor: 6, y: 237 }]),

    // R5: B, C and D merge into one pink node; from it the active arm leads to B.
    // Lever stands in the spacer slot on both banks.
    round(5,
      [{ points: 2, cap: 3 },
       { points: 1, cap: 2 },
       { points: 6, cap: 3 },
       { points: 4, cap: 2 },
       { points: null, cap: 0, spacer: true },
       { points: 3, cap: 4 }
      ],
      [{ color: PINK, side: 'both', tracks: [1, 2, 3], anchor: 2,
         y: 313, armTop: 238, mergeY: 385, activeTrack: 1, leverAt: 4 }]),

    // R6: A/B/C merge into the left purple node, D/E into the second one. The flipped
    // purple arm from D climbs into the cyan node on E, which in turn chooses between
    // E's own box and the floating 6. On the right a cyan node picks F or the floating 4.
    // Purple lever sits above C (that column has no box of its own), cyan lever below the
    // floating 6 (that column has no letter).
    round(6,
      [{ points: 2, cap: 3 },                     // A
       { points: 3, cap: 2 },                     // B
       { points: 0, cap: 1 },                     // C — no destination box
       { points: 1, cap: 3 },                     // D
       { points: 4, cap: 2 },                     // E
       { points: 6, cap: 0, floating: true },
       { points: 4, cap: 0, floating: true },
       { points: 2, cap: 3 }],                    // F
      [{ color: PURPLE, side: 'north', tracks: [0, 1], anchor: 0, y: 262, armTop: 155, merge: [0, 1, 2], leverAt: 2 },
       { color: PURPLE, side: 'north', tracks: [3, 4], anchor: 3, y: 313, armTop: 210, merge: [3, 4] },
       { color: CYAN, side: 'south', tracks: [4, 5], anchor: 4, y: 210, armTop: 120, leverAt: 5 },
       { color: CYAN, side: 'south', tracks: [7, 6], anchor: 7, y: 265, armTop: 170 }]),

    // R7: crossed purple pair A/B, purple C reaching for the floating 1, and a pink
    // three-way node on D whose active arm also points at that floating 1.
    // Pink lever sits in the spacer slot up north, purple lever under the floating column.
    round(7,
      [{ points: 4, cap: 2 },                     // A
       { points: 1, cap: 3 },                     // B
       { points: null, cap: 0, spacer: true },
       { points: 3, cap: 3 },                     // C
       { points: 1, cap: 0, floating: true },
       { points: 3, cap: 3 },                     // D
       { points: 5, cap: 1 }],                    // E
      [{ color: PURPLE, side: 'south', tracks: [0, 1], anchor: 0, y: 262, armTop: 160, leverAt: 4 },
       { color: PURPLE, side: 'south', tracks: [1, 0], anchor: 1, y: 262, armTop: 160 },
       { color: PURPLE, side: 'south', tracks: [3, 4], anchor: 3, y: 313, armTop: 225 },
       { color: PINK, side: 'north', tracks: [4, 5, 6], anchor: 5, y: 242, armTop: 168,
         activeTrack: 4, leverAt: 2 }]),

    // R8: A, B, C and D all feed one purple node standing on A; its active arm goes to
    // the floating 2, the flipped one to B's box. Only B and E own a box, so the lever
    // takes D's free top slot. E is an untouched straight path.
    round(8,
      [{ points: 2, cap: 0, floating: true },
       { points: 0, cap: 5 },                   // A — no box of its own
       { points: 4, cap: 4 },                   // B
       { points: 0, cap: 3 },                   // C
       { points: 0, cap: 2 },                   // D
       { points: 6, cap: 1 }],                  // E
      [{ color: PURPLE, side: 'north', tracks: [0, 2], anchor: 1, y: 253, armTop: 155,
         merge: [1, 2, 3, 4], activeTrack: 0, leverAt: 4 }]),

    // R9: three identical pairs — A/B purple, C/D pink, E/F cyan. In each pair both
    // tracks join the node, the active arm goes to the left box and the flipped one to
    // the right box. Two spacer columns hold the four levers; the cyan switch is usable
    // from either bank, and its two levers sit in different columns.
    round(9,
      [{ points: 2, cap: 3 },                     // A
       { points: 6, cap: 1 },                     // B
       { points: null, cap: 0, spacer: true },
       { points: 3, cap: 3 },                     // C
       { points: 4, cap: 1 },                     // D
       { points: null, cap: 0, spacer: true },
       { points: 1, cap: 3 },                     // E
       { points: 5, cap: 1 }],                    // F
      [{ color: PURPLE, side: 'north', tracks: [0, 1], anchor: 0, y: 262, armTop: 155, merge: [0, 1], leverAt: 2 },
       { color: PINK, side: 'south', tracks: [3, 4], anchor: 3, y: 262, armTop: 155, merge: [3, 4], leverAt: 5 },
       { color: CYAN, side: 'both', tracks: [6, 7], anchor: 6, y: 262, armTop: 155, merge: [6, 7],
         leverN: 5, leverS: 2 }]),
  ]
}
