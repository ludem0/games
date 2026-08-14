// The printed board and the puzzle types, kept apart from the engine so the
// browser can draw them without dragging the file storage along.

export const COLUMNS = 10
export const ROWS = 9

/** Grey border, fifty numbered squares inside, exactly as printed. */
export const BOARD: (number | null)[] = [
  null, null, null, null, null, null, null, null, null, null,
  null, null, 26, 47, 44, 15, 24, 49, null, null,
  null, 46, 43, 30, 25, 48, 1, 14, 17, null,
  null, 27, 37, 45, 36, 31, 16, 23, 2, null,
  null, null, 42, 6, 29, 0, 13, 18, null, null,
  null, 7, 28, 9, 32, 38, 20, 3, 22, null,
  null, 10, 35, 41, 5, 12, 33, 39, 19, null,
  null, null, 8, 11, 34, 40, 4, 21, null, null,
  null, null, null, null, null, null, null, null, null, null,
]

export const PUZZLE_TYPES = [
  'Word', 'Ancient', 'Maths', 'Newspaper', 'Image',
  'Reference', 'Riddle', 'Genius', 'Computation', 'Mystery',
] as const
export type PuzzleType = typeof PUZZLE_TYPES[number]
