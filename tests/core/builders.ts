import type { Project, Rect, Shape } from '../../src/core/model/types'
import type { Layout, LayoutRow, Piece } from '../../src/core/model/layout'
import { DEFAULT_LAYOUT, DEFAULT_PLANK, DEFAULT_RULES, defaultPins } from '../../src/core/model/defaults'
import { frameFor } from '../../src/core/geometry/frame'

export const P = DEFAULT_PLANK.length
export const CW = DEFAULT_PLANK.coverWidth

export const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/**
 * A test project with the solver-test-spec defaults (gaps 0). The first rect is the room; the
 * rest are obstacles with gap 0.
 */
export function testProject(room: Rect, obstacles: Rect[] = [], overrides: Partial<Project> = {}): Project {

  const shapes: Shape[] = [
    { id: 'room', op: 'add', ...room },
    ...obstacles.map((o, i): Shape => ({ id: `obs${i}`, op: 'subtract', gap: 0, ...o })),
  ]

  return {
    version: 1,
    id: 'test',
    name: 'test',
    room: { wallGap: 0, shapes },
    plank: DEFAULT_PLANK,
    layout: DEFAULT_LAYOUT,
    rules: DEFAULT_RULES,
    pins: defaultPins(),
    ...overrides,
  }
}

/** A source for a piece: [plank, from, to]. */
export type Src = [plank: number, from: number, to: number]

/** A segment starting at x0, made of pieces laid left to right with lengths taken from their sources. */
export function seg(x0: number, sources: Src[], rowIndex = 0): { x0: number, x1: number, pieces: Piece[] } {

  let x = x0
  const pieces = sources.map(([plank, from, to], k): Piece => {
    const piece = { id: `r${rowIndex}-${x0}-${k}`, x0: x, x1: x + (to - from), source: { plank, from, to } }
    x = piece.x1
    return piece
  })

  return { x0, x1: x, pieces }
}

export function row(index: number, y0: number, y1: number, segments: ReturnType<typeof seg>[]): LayoutRow {

  return { index, y0, y1, segments }
}

export function layout(project: Project, rip: number, rows: LayoutRow[]): Layout {

  const planks = 1 + Math.max(-1, ...rows.flatMap(r => r.segments.flatMap(s => s.pieces.map(p => p.source.plank))))

  return { frame: frameFor(project.layout), rip, rows, planks }
}

/**
 * Sources for a straight run of `length` mm starting with an R-piece of `start` mm, then full
 * planks, then an L-piece. Each piece gets a fresh plank, numbered from `firstPlank`.
 */
export function run(length: number, start: number, firstPlank: number): Src[] {

  const out: Src[] = []
  let plank = firstPlank
  let left = length

  const first = Math.min(start, left)
  out.push([plank++, P - first, P])
  left -= first

  while (left >= P) {
    out.push([plank++, 0, P])
    left -= P
  }
  if (left > 0) {
    out.push([plank, 0, left])
  }

  return out
}
