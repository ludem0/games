// The forty eight pieces of Domain, written as plain polygons so that both the
// browser and the server can draw and measure them without any canvas. No fs here.

export type Pt = [number, number]
export type Poly = Pt[]

/** Board is two square domains side by side, blue on the left and red on the right. */
export const BOARD_W = 1200
export const BOARD_H = 600
/** A piece may not touch the purple frame, so this ring of pixels is out of bounds. */
export const BORDER = 10

export interface ShapeDef {
  id: number
  name: string
  /** filled outline, several rings are treated as a union */
  body: Poly[]
  /** cut out of the body entirely, nothing is painted there */
  holes: Poly[]
  /** painted as a void zone: no later piece may cover it */
  voids: Poly[]
  /** painted back in the owner's colour on top of the voids */
  caps: Poly[]
  /** whoever drafts this piece places first */
  start?: boolean
}

// ---------- little geometry helpers ----------

const TAU = Math.PI * 2

function arc(rx: number, ry: number, a0: number, a1: number, seg: number, cx = 0, cy = 0): Poly {
  const pts: Poly = []
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg)
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return pts
}

const ellipse = (rx: number, ry: number, cx = 0, cy = 0, seg = 48): Poly =>
  arc(rx, ry, 0, TAU, seg, cx, cy).slice(0, -1)

const circle = (r: number, cx = 0, cy = 0, seg = 48): Poly => ellipse(r, r, cx, cy, seg)

const rect = (w: number, h: number, cx = 0, cy = 0): Poly => [
  [cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2],
]

const regular = (n: number, r: number, rot = -Math.PI / 2): Poly =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (TAU * i) / n
    return [r * Math.cos(a), r * Math.sin(a)] as Pt
  })

const star = (n: number, rOut: number, rIn: number, rot = -Math.PI / 2): Poly =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (TAU * i) / (n * 2)
    const r = i % 2 === 0 ? rOut : rIn
    return [r * Math.cos(a), r * Math.sin(a)] as Pt
  })

/** A slice of a ring, used for arches and crescents. */
const band = (rOut: number, rIn: number, a0: number, a1: number, seg = 32): Poly =>
  [...arc(rOut, rOut, a0, a1, seg), ...arc(rIn, rIn, a1, a0, seg)]

const pie = (r: number, a0: number, a1: number, seg = 32): Poly =>
  [[0, 0], ...arc(r, r, a0, a1, seg)]

const diamond = (w: number, h: number): Poly => [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]]

const cross = (size: number, thick: number): Poly => {
  const a = size / 2
  const t = thick / 2
  return [
    [-t, -a], [t, -a], [t, -t], [a, -t], [a, t], [t, t],
    [t, a], [-t, a], [-t, t], [-a, t], [-a, -t], [-t, -t],
  ]
}

const trapezoid = (topW: number, botW: number, h: number): Poly => [
  [-topW / 2, -h / 2], [topW / 2, -h / 2], [botW / 2, h / 2], [-botW / 2, h / 2],
]

const parallelogram = (w: number, h: number, skew: number): Poly => [
  [-w / 2 + skew, -h / 2], [w / 2 + skew, -h / 2], [w / 2 - skew, h / 2], [-w / 2 - skew, h / 2],
]

const triangle = (w: number, h: number): Poly => [[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]

/** A horizontal ribbon whose top and bottom edges both ripple. */
const waveBand = (w: number, h: number, amp: number, waves: number, seg = 40): Poly => {
  const top: Poly = []
  const bottom: Poly = []
  for (let i = 0; i <= seg; i++) {
    const x = -w / 2 + (w * i) / seg
    const s = Math.sin((i / seg) * TAU * waves)
    top.push([x, -h / 2 + amp * s])
    bottom.push([x, h / 2 + amp * s])
  }
  return [...top, ...bottom.reverse()]
}

/** Same ribbon stood on its end. */
const waveColumn = (w: number, h: number, amp: number, waves: number, seg = 40): Poly =>
  waveBand(h, w, amp, waves, seg).map(([x, y]) => [y, x] as Pt)

const heart = (size: number): Poly => {
  const pts: Poly = []
  for (let i = 0; i < 60; i++) {
    const t = (TAU * i) / 60
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    pts.push([(x * size) / 32, (y * size) / 32])
  }
  return pts
}

/** A puffy outline: a circle whose radius wobbles in and out. */
const cloud = (r: number, bumps: number, depth = 0.14): Poly =>
  Array.from({ length: 120 }, (_, i) => {
    const a = (TAU * i) / 120
    const rr = r * (1 + depth * Math.cos(a * bumps))
    return [rr * Math.cos(a), rr * Math.sin(a) * 0.78] as Pt
  })

const bowtie = (w: number, h: number): Poly => [
  [-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2],
]

const chevron = (w: number, h: number, thick: number): Poly => [
  [-w / 2, -h / 2], [-w / 2 + thick, -h / 2], [w / 2, 0], [-w / 2 + thick, h / 2],
  [-w / 2, h / 2], [-w / 2 + thick - Math.min(thick, w / 2), 0],
]

const lightning = (w: number, h: number): Poly => [
  [w * 0.1, -h / 2], [w / 2, -h * 0.1], [w * 0.15, -h * 0.05],
  [w * 0.45, h * 0.5], [-w / 2, h * 0.05], [-w * 0.05, 0], [-w * 0.35, -h * 0.25],
]

const arrowDown = (w: number, h: number, stem: number): Poly => [
  [-stem / 2, -h / 2], [stem / 2, -h / 2], [stem / 2, h * 0.1],
  [w / 2, h * 0.1], [0, h / 2], [-w / 2, h * 0.1], [-stem / 2, h * 0.1],
]

const arrowUp = (w: number, h: number, stem: number): Poly =>
  arrowDown(w, h, stem).map(([x, y]) => [x, -y] as Pt)

/** A square with a rectangular bite taken out of the bottom edge. */
const notched = (w: number, h: number, nw: number, nh: number): Poly => [
  [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [nw / 2, h / 2],
  [nw / 2, h / 2 - nh], [-nw / 2, h / 2 - nh], [-nw / 2, h / 2], [-w / 2, h / 2],
]

/** An L shaped bracket drawn from its outer corner. */
const elbow = (arm: number, thick: number): Poly => [
  [-arm / 2, -arm / 2], [-arm / 2 + thick, -arm / 2], [-arm / 2 + thick, arm / 2 - thick],
  [arm / 2, arm / 2 - thick], [arm / 2, arm / 2], [-arm / 2, arm / 2],
]

const drop = (r: number): Poly => [[-r, -r], [0, -r], ...arc(r, r, -Math.PI / 2, Math.PI, 36), [-r, 0]]

const shift = (poly: Poly, dx: number, dy: number): Poly => poly.map(([x, y]) => [x + dx, y + dy] as Pt)

const spin = (poly: Poly, deg: number): Poly => {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return poly.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as Pt)
}

const shape = (
  id: number, name: string, body: Poly[],
  extra: { holes?: Poly[]; voids?: Poly[]; caps?: Poly[]; start?: boolean } = {},
): ShapeDef => ({
  id, name, body,
  holes: extra.holes ?? [], voids: extra.voids ?? [], caps: extra.caps ?? [],
  ...(extra.start ? { start: true } : {}),
})

// ---------- the pool ----------

export const SHAPES: ShapeDef[] = [
  shape(1, 'Квадрат с кругом', [rect(150, 150)], { voids: [circle(34)] }),
  shape(2, 'Капля с кругом', [drop(70)], { voids: [circle(30, -14, 6)] }),
  shape(3, 'Выноска с сердцем', [ellipse(105, 88), [[-30, 60], [10, 60], [-24, 108]]], { voids: [heart(96)] }),
  shape(4, 'Знак запрета', [circle(72)], { voids: [circle(52)], caps: [spin(rect(104, 22), -40)] }),
  shape(5, 'Облако с ромбом', [cloud(120, 9)], { voids: [diamond(52, 52)] }),
  shape(6, 'Скруглённый блок', [[[-96, -46], [80, -46], [104, 0], [80, 46], [-96, 46], [-116, 0]]], { voids: [regular(6, 26)] }),
  shape(7, 'Пятиугольник', [regular(5, 96)], { voids: [regular(5, 34)] }),
  shape(8, 'Крест с ромбом', [cross(160, 62)], { voids: [diamond(46, 46)] }),
  shape(9, 'Двойная волна', [waveBand(230, 44, 22, 2)], { voids: [waveBand(150, 14, 12, 2)] }),
  shape(10, 'Волнистая лента', [waveColumn(78, 190, 12, 2)], { voids: [regular(5, 20)] }),
  shape(11, 'Трапеция', [trapezoid(210, 330, 120)], {
    voids: [shift(trapezoid(22, 34, 84), -110, 16), shift(trapezoid(22, 34, 84), 110, 16)],
  }),
  shape(12, 'Квадрат в рамке', [rect(170, 170)], { voids: [rect(170, 170)], caps: [rect(146, 146)] }),
  shape(13, 'Взрыв', [star(12, 96, 52)], { voids: [star(12, 96, 52)], caps: [star(12, 84, 45)] }),
  shape(14, 'Арка', [band(120, 62, Math.PI, TAU)], { voids: [band(78, 62, Math.PI, TAU)] }),
  shape(15, 'Семиугольник', [regular(7, 104)], { voids: [regular(7, 104)], caps: [regular(7, 92)] }),
  shape(16, 'Молния', [lightning(96, 210)], { voids: [lightning(96, 210)], caps: [lightning(80, 190)] }),
  shape(17, 'Воздушный змей', [[[0, -100], [56, -6], [0, 100], [-56, -6]]], { voids: [rect(112, 8, 0, -6)] }),
  shape(18, 'Большая рамка', [rect(320, 300)], { holes: [rect(272, 252)], voids: [rect(320, 300)], caps: [rect(308, 288)] }),
  // the slash is part of the piece as well as a void, so it hangs past the two bars
  shape(19, 'Знак неравенства', [rect(150, 26, 0, -26), rect(150, 26, 0, 26), spin(rect(190, 22), -34)], {
    voids: [spin(rect(190, 22), -34)],
  }),
  shape(20, 'Стрелка вниз', [arrowDown(180, 210, 116)], {
    voids: [rect(30, 120, -40, -44), rect(30, 120, 40, -44)],
  }),
  shape(21, 'Круговой сектор', [circle(96)], { voids: [pie(96, -Math.PI / 2, 0)] }),
  shape(22, 'Песочные часы', [bowtie(120, 190)], { voids: [circle(26)] }),
  shape(23, 'Волнистая колонна', [waveColumn(72, 300, 16, 3)], {
    voids: [circle(26, 30, -90), circle(26, -30, 60)],
  }),
  shape(24, 'Половина квадрата', [rect(160, 160)], { voids: [[[-80, -80], [80, -80], [80, 80]]] }),
  shape(25, 'Игла', [triangle(70, 300)], { voids: [shift(triangle(40, 190), 0, 52)], caps: [shift(triangle(14, 60), 0, 24)] }),
  shape(26, 'Уголок с шарами', [elbow(220, 30)], {
    voids: [circle(22, -95, -95), circle(22, 95, 95)],
  }),
  shape(27, 'Штанга', [rect(300, 34), rect(60, 60, -150, 0), rect(60, 60, 150, 0)], { voids: [rect(240, 34)] }),
  shape(28, 'Обратная штанга', [rect(300, 34), rect(60, 60, -150, 0), rect(60, 60, 150, 0)], {
    voids: [rect(60, 60, -150, 0), rect(60, 60, 150, 0)],
  }),
  shape(29, 'Start', [circle(52)], { start: true }),
  shape(30, 'Малый ромб', [diamond(120, 60)]),
  shape(31, 'Квадрат с вырезом', [notched(200, 160, 90, 90)]),
  shape(32, 'Кольцо', [circle(88)], { holes: [circle(64)] }),
  shape(33, 'Солнце', [star(8, 52, 22)]),
  shape(34, 'Зазубренная стрела', [[
    [-130, -10], [-40, -80], [-30, -46], [70, -86], [46, -30], [130, -14],
    [40, 26], [76, 84], [-16, 60], [-60, 96], [-64, 30],
  ]]),
  shape(35, 'Четырёхлучевая звезда', [star(4, 108, 30)]),
  shape(36, 'Шестилучевая звезда', [star(6, 100, 52)]),
  shape(37, 'Шеврон', [chevron(190, 150, 66)]),
  shape(38, 'Блок со стрелкой', [rect(180, 110, 0, 26), arrowUp(80, 90, 44).map(([x, y]) => [x, y - 62] as Pt)]),
  shape(39, 'Двойное сердце', [shift(heart(150), -52, 0), shift(heart(150), 52, 0)]),
  shape(40, 'Малая рамка', [rect(120, 120)], { holes: [rect(64, 64)] }),
  shape(41, 'Полумесяц', [band(130, 78, 0.35, Math.PI - 0.35)]),
  shape(42, 'Уголок', [elbow(200, 44)]),
  shape(43, 'Высокий треугольник', [triangle(180, 380)], { voids: [shift(triangle(74, 200), -8, 74)] }),
  shape(44, 'Диагональная полоса', [parallelogram(420, 130, 150)], {
    voids: [shift(rect(96, 34), 108, -40), shift(rect(34, 96), -104, 24)],
  }),
  shape(45, 'Круг с крестом', [circle(140)], { voids: [cross(150, 54)] }),
  shape(46, 'Двойной клин', [
    [[-90, -130], [96, -74], [-40, -50]],
    [[-90, -20], [110, 96], [-70, 130]],
  ], {
    voids: [shift(regular(5, 22, 0), -46, -96), shift(regular(5, 30, 0), -22, 30)],
  }),
  shape(47, 'Параллелограмм', [parallelogram(260, 240, 60)], { voids: [parallelogram(120, 90, 26)] }),
  shape(48, 'Большой ромб', [diamond(420, 220)], { voids: [diamond(90, 50)] }),
]

export const SHAPE_COUNT = SHAPES.length
export const PER_PLAYER = SHAPE_COUNT / 2
export const START_SHAPE = SHAPES.find(s => s.start)?.id ?? 29

export const shapeById = (id: number): ShapeDef | undefined => SHAPES.find(s => s.id === id)

// ---------- moving a piece into place ----------

export interface Placement {
  shapeId: number
  owner: string
  x: number
  y: number
  /** degrees, clockwise on screen */
  rot: number
}

export function transform(poly: Poly, x: number, y: number, rot: number): Poly {
  const a = (rot * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return poly.map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos] as Pt)
}

export interface PlacedRings {
  body: Poly[]
  holes: Poly[]
  voids: Poly[]
  caps: Poly[]
}

export function placedRings(shape: ShapeDef, x: number, y: number, rot: number): PlacedRings {
  const go = (polys: Poly[]) => polys.map(p => transform(p, x, y, rot))
  return { body: go(shape.body), holes: go(shape.holes), voids: go(shape.voids), caps: go(shape.caps) }
}

export function bounds(polys: Poly[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  return { x0, y0, x1, y1 }
}

/** Longest reach from the piece's own origin, used to keep it clear of the frame. */
export function radiusOf(shape: ShapeDef): number {
  let best = 0
  for (const poly of [...shape.body, ...shape.voids]) {
    for (const [x, y] of poly) best = Math.max(best, Math.hypot(x, y))
  }
  return best
}

export const svgPath = (poly: Poly): string =>
  poly.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + 'Z'
