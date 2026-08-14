// The board data for Tug of War, read off the reference art module by module.
// The engine that plays the match is built on top of this; keeping the numbers
// here means they can be checked against the pictures without reading code.

export const MODULES = ['rope', 'race', 'collation', 'clock', 'path', 'conker', 'tower'] as const
export type ModuleId = typeof MODULES[number]

export const MODULE_NAMES: Record<ModuleId, string> = {
  rope: 'Канат', race: 'Гонка', collation: 'Сбор', clock: 'Часы',
  path: 'Путь', conker: 'Каштаны', tower: 'Башня',
}

export const MODULES_TO_WIN = 3
export const START_HAND_FIRST = [1, 1, 1]
export const START_HAND_SECOND = [1, 1, 2]
export const MAX_HAND = 5
export const MAX_CARDS_PER_TURN = 3
export const MAX_CARDS_ON_PATH = 2
export const MAX_CARD_STRENGTH = 5
export const TURN_MS = 120_000
export const RESERVE_MS = 600_000

// ---------- rope ----------

export const ROPE_TRACK = 18
/**
 * Which reward letter each spot on the rope carries, counting from the pit.
 * Spot one sits beside the pit and spot eighteen is as far away as it goes.
 */
export const ROPE_LETTERS: Record<number, string> = {
  1: 'G', 2: 'A', 3: 'B', 4: 'F', 5: 'C', 6: 'A',
  7: 'E', 8: 'F', 9: 'D', 10: 'A', 11: 'B', 12: 'C',
  13: 'E', 14: 'F', 15: 'B', 16: 'D', 17: 'A', 18: 'G',
}

export const ROPE_REWARDS: Record<string, string> = {
  A: 'Карта силой в разницу числа карт на руках плюс 1',
  B: 'Карта силой 4, сопернику карта силой 1',
  C: 'Три карты силой 1, сопернику карта силой 2',
  D: 'Карта силой в число выигранных вами модулей плюс 1',
  E: 'Карта силой в число карт, сыгранных вами на этом модуле в этот ход',
  F: 'Карта силой в число ваших очков на активных модулях плюс 1',
  G: 'Карта силой 5',
}

export const ROPE_POINTS_TO_WIN = 2

// ---------- race ----------

export const RACE_TRACK = 13
/** Movement stops on either puddle, which sit on steps four and nine. */
export const RACE_PUDDLES = [4, 9]
export const RACE_POINTS_TO_WIN = 2

// ---------- collation ----------

export const COLLATION_PILE = 25
export const COLLATION_POINTS_TO_WIN = 2
/** Once this many counters are gone, thirteen in one hand settles it early. */
export const COLLATION_EARLY_TAKEN = 20
export const COLLATION_EARLY_HELD = 13
export const COLLATION_CARDS_PER_COUNTERS = 5

// ---------- clock ----------

export const CLOCK_SEGMENTS = 8
export const CLOCK_SEGMENT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const CLOCK_POINTS_TO_WIN = 2
/** Red fills clockwise and blue anticlockwise, which is what makes it a fight. */
export const CLOCK_DIRECTIONS = { red: 'clockwise', blue: 'anticlockwise' } as const

// ---------- path ----------

export const PATH_SIZE = 8
export const PATH_POINTS_TO_WIN = 2
export const PATH_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// ---------- conker ----------

export const CONKER_POINTS_TO_WIN = 4

// ---------- tower ----------

export const TOWER_MAX = 49
export const TOWER_LIGHT_EVERY = 7
/** The later version of the rules lowered this from three lights to two. */
export const TOWER_LIGHT_LEAD = 2

export const TOWER_REWARDS: Record<string, string> = {
  A: 'Карта силой в разницу зажжённых огней на башнях плюс 1',
  B: 'Карта силой 4, сопернику карта силой 1',
  C: 'Три карты силой 1, сопернику карта силой 2',
}

// ---------- shared helpers ----------

/**
 * A reward above five spills into a second card: seven becomes a five and a two.
 * A reward of nothing is simply no card at all.
 */
export function cascade(strength: number): number[] {
  if (strength <= 0) return []
  const cards: number[] = []
  let left = Math.floor(strength)
  while (left > MAX_CARD_STRENGTH) {
    cards.push(MAX_CARD_STRENGTH)
    left -= MAX_CARD_STRENGTH
  }
  if (left > 0) cards.push(left)
  return cards
}

/** How many lights a tower of this height has lit. */
export function towerLights(height: number): number {
  return Math.floor(Math.min(height, TOWER_MAX) / TOWER_LIGHT_EVERY)
}

/** Where a racer ends up, stopping dead at the first puddle it reaches. */
export function raceMove(from: number, strength: number): number {
  const target = from + strength
  if (target > RACE_TRACK) return from
  for (const puddle of RACE_PUDDLES) {
    if (from < puddle && target >= puddle) return puddle
  }
  return target
}

/**
 * Which modules a player may pick this turn. Early on neither side may return
 * to the module either of them just used; later only your own last one is shut.
 */
export function allowedModules(
  active: ModuleId[], myLast: ModuleId | null, theirLast: ModuleId | null,
): ModuleId[] {
  const strict = active.length >= 5
  return active.filter(id => (strict
    ? id !== myLast && id !== theirLast
    : id !== myLast))
}
