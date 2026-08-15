// Scoring for Domain. The board is measured the way the original match was: paint
// every piece in the order it went down, then count the coloured pixels.

import {
  BOARD_H, BOARD_W, BORDER, placedRings, shapeById, bounds,
  type Placement, type Poly,
} from './domainShapes'

export const BLUE = 1
export const RED = 2
export const VOID = 3

export type Ink = typeof BLUE | typeof RED

/** Fills one simple polygon into a bbox sized mask with the even odd rule. */
function stamp(mask: Uint8Array, x0: number, y0: number, w: number, h: number, poly: Poly): void {
  if (poly.length < 3) return
  const crossings: number[] = []
  for (let row = 0; row < h; row++) {
    const y = y0 + row + 0.5
    crossings.length = 0
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[(i + 1) % poly.length]
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        crossings.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
      }
    }
    if (crossings.length < 2) continue
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - x0 - 0.5))
      const to = Math.min(w - 1, Math.floor(crossings[i + 1] - x0 - 0.5))
      for (let col = from; col <= to; col++) mask[row * w + col] = 1
    }
  }
}

function maskOf(polys: Poly[], x0: number, y0: number, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (const poly of polys) stamp(mask, x0, y0, w, h, poly)
  return mask
}

export interface Footprint {
  x0: number
  y0: number
  w: number
  h: number
  /** solid part of the piece, holes already cut away */
  body: Uint8Array
  /** void zones, always a subset of the body */
  voids: Uint8Array
  /** owner coloured patches sitting on top of the voids */
  caps: Uint8Array
  /** true when some part of the piece falls outside the playable area */
  offBoard: boolean
}

export function footprintOf(placement: Placement): Footprint | null {
  const shape = shapeById(placement.shapeId)
  if (!shape) return null
  const rings = placedRings(shape, placement.x, placement.y, placement.rot)
  const all = [...rings.body, ...rings.voids]
  const box = bounds(all)

  const x0 = Math.floor(box.x0) - 1
  const y0 = Math.floor(box.y0) - 1
  const w = Math.ceil(box.x1) - x0 + 2
  const h = Math.ceil(box.y1) - y0 + 2
  if (w <= 0 || h <= 0 || w > BOARD_W * 3 || h > BOARD_H * 3) return null

  const body = maskOf(rings.body, x0, y0, w, h)
  const holes = maskOf(rings.holes, x0, y0, w, h)
  for (let i = 0; i < body.length; i++) if (holes[i]) body[i] = 0

  const voids = maskOf(rings.voids, x0, y0, w, h)
  const caps = maskOf(rings.caps, x0, y0, w, h)
  for (let i = 0; i < voids.length; i++) if (!body[i]) voids[i] = 0
  for (let i = 0; i < caps.length; i++) if (!body[i]) caps[i] = 0

  let offBoard = false
  for (let row = 0; row < h && !offBoard; row++) {
    for (let col = 0; col < w; col++) {
      if (!body[row * w + col]) continue
      const x = x0 + col
      const y = y0 + row
      if (x < BORDER || y < BORDER || x >= BOARD_W - BORDER || y >= BOARD_H - BORDER) {
        offBoard = true
        break
      }
    }
  }

  return { x0, y0, w, h, body, voids, caps, offBoard }
}

/** The frame itself belongs to nobody, so only the playable area is ever counted. */
export function freshBoard(): Uint8Array {
  const board = new Uint8Array(BOARD_W * BOARD_H)
  for (let y = BORDER; y < BOARD_H - BORDER; y++) {
    for (let x = BORDER; x < BOARD_W - BORDER; x++) {
      board[y * BOARD_W + x] = x < BOARD_W / 2 ? BLUE : RED
    }
  }
  return board
}

function daub(board: Uint8Array, print: Footprint, ink: Ink): void {
  for (let row = 0; row < print.h; row++) {
    const y = print.y0 + row
    if (y < 0 || y >= BOARD_H) continue
    for (let col = 0; col < print.w; col++) {
      const x = print.x0 + col
      if (x < 0 || x >= BOARD_W) continue
      const i = row * print.w + col
      if (!print.body[i]) continue
      const at = y * BOARD_W + x
      board[at] = print.caps[i] ? ink : print.voids[i] ? VOID : ink
    }
  }
}

/** Replays every placement in order and hands back the finished board. */
export function paintBoard(placements: Placement[], inkOf: (owner: string) => Ink): Uint8Array {
  const board = freshBoard()
  for (const placement of placements) {
    const print = footprintOf(placement)
    if (print) daub(board, print, inkOf(placement.owner))
  }
  return board
}

export interface Score { blue: number; red: number; voids: number }

export function scoreBoard(board: Uint8Array): Score {
  let blue = 0
  let red = 0
  let voids = 0
  for (let i = 0; i < board.length; i++) {
    if (board[i] === BLUE) blue++
    else if (board[i] === RED) red++
    else if (board[i] === VOID) voids++
  }
  return { blue, red, voids }
}

/** A piece has to sit clear of the frame and may never cover an existing void. */
export function checkPlacement(board: Uint8Array, placement: Placement): string | null {
  const print = footprintOf(placement)
  if (!print) return 'Такой фигуры нет'
  if (print.offBoard) return 'Фигура задевает рамку или выходит за доску'

  for (let row = 0; row < print.h; row++) {
    const y = print.y0 + row
    if (y < 0 || y >= BOARD_H) continue
    for (let col = 0; col < print.w; col++) {
      const x = print.x0 + col
      if (x < 0 || x >= BOARD_W) continue
      if (!print.body[row * print.w + col]) continue
      if (board[y * BOARD_W + x] === VOID) return 'Нельзя накрывать пустую зону'
    }
  }
  return null
}
