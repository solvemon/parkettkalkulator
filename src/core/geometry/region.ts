import type { Rect } from '../model/types'

/**
 * A rectilinear point set, stored as a canonical list of disjoint half-open rects.
 *
 * Canonical form: every horizontal slice is split into maximal x-runs, and identical runs in
 * consecutive slices are stacked into one rect. Rects are sorted by (y, x). Two regions that cover
 * the same points are therefore deep-equal, which keeps tests and determinism simple.
 *
 * All operations work on a compressed integer grid built from the rect edges, so they are exact.
 */
export type Region = Rect[]

interface Grid {
  xs: number[]
  ys: number[]
  nx: number
  ny: number
}

export function fromRects(rects: readonly Rect[]): Region {

  const nonEmpty = rects.filter(r => r.w > 0 && r.h > 0)
  const grid = gridFor([nonEmpty])

  return extract(grid, rasterize(grid, nonEmpty))
}

export function union(a: Region, b: Region): Region {

  return combine(a, b, (p, q) => p || q)
}

export function difference(a: Region, b: Region): Region {

  return combine(a, b, (p, q) => p && !q)
}

export function intersect(a: Region, b: Region): Region {

  return combine(a, b, (p, q) => p && q)
}

export function isEmpty(region: Region): boolean {

  return region.length === 0
}

export function area(region: Region): number {

  return region.reduce((sum, r) => sum + r.w * r.h, 0)
}

/** Bounding box, or null for an empty region. */
export function bbox(region: Region): Rect | null {

  if (region.length === 0) {
    return null
  }

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of region) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }

  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Connected components. Parts are connected only through a shared edge of positive length;
 * touching at a corner does not connect. Components are ordered by their first rect (y, x).
 */
export function components(region: Region): Region[] {

  const grid = gridFor([region])
  const cells = rasterize(grid, region)
  const label = new Int32Array(cells.length).fill(-1)
  const result: Region[] = []

  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || label[start] !== -1) {
      continue
    }

    const id = result.length
    const mine = new Uint8Array(cells.length)
    const stack = [start]
    label[start] = id

    while (stack.length > 0) {
      const c = stack.pop()!
      mine[c] = 1
      const i = c % grid.nx
      const j = (c - i) / grid.nx
      const neighbours = [
        i > 0 ? c - 1 : -1,
        i < grid.nx - 1 ? c + 1 : -1,
        j > 0 ? c - grid.nx : -1,
        j < grid.ny - 1 ? c + grid.nx : -1,
      ]
      for (const n of neighbours) {
        if (n >= 0 && cells[n] && label[n] === -1) {
          label[n] = id
          stack.push(n)
        }
      }
    }

    result.push(extract(grid, mine))
  }

  return result.sort((a, b) => compareRect(a[0]!, b[0]!))
}

function combine(a: Region, b: Region, op: (p: boolean, q: boolean) => boolean): Region {

  const grid = gridFor([a, b])
  const ca = rasterize(grid, a)
  const cb = rasterize(grid, b)

  const out = new Uint8Array(ca.length)
  for (let k = 0; k < out.length; k++) {
    out[k] = op(ca[k] === 1, cb[k] === 1) ? 1 : 0
  }

  return extract(grid, out)
}

function gridFor(lists: readonly (readonly Rect[])[]): Grid {

  const xs = new Set<number>()
  const ys = new Set<number>()
  for (const list of lists) {
    for (const r of list) {
      xs.add(r.x)
      xs.add(r.x + r.w)
      ys.add(r.y)
      ys.add(r.y + r.h)
    }
  }

  const sortedXs = [...xs].sort((p, q) => p - q)
  const sortedYs = [...ys].sort((p, q) => p - q)

  return {
    xs: sortedXs,
    ys: sortedYs,
    nx: Math.max(0, sortedXs.length - 1),
    ny: Math.max(0, sortedYs.length - 1),
  }
}

function rasterize(grid: Grid, rects: readonly Rect[]): Uint8Array {

  const cells = new Uint8Array(grid.nx * grid.ny)
  for (const r of rects) {
    const i0 = indexOf(grid.xs, r.x)
    const i1 = indexOf(grid.xs, r.x + r.w)
    const j0 = indexOf(grid.ys, r.y)
    const j1 = indexOf(grid.ys, r.y + r.h)
    for (let j = j0; j < j1; j++) {
      cells.fill(1, j * grid.nx + i0, j * grid.nx + i1)
    }
  }

  return cells
}

function extract(grid: Grid, cells: Uint8Array): Region {

  const done: Rect[] = []
  let open = new Map<string, Rect>()

  for (let j = 0; j < grid.ny; j++) {
    const y = grid.ys[j]!
    const h = grid.ys[j + 1]! - y
    const next = new Map<string, Rect>()

    let i = 0
    while (i < grid.nx) {
      if (!cells[j * grid.nx + i]) {
        i++
        continue
      }
      const i0 = i
      while (i < grid.nx && cells[j * grid.nx + i]) {
        i++
      }

      const x0 = grid.xs[i0]!
      const x1 = grid.xs[i]!
      const key = `${x0},${x1}`
      const above = open.get(key)
      if (above) {
        above.h += h
        next.set(key, above)
        open.delete(key)
      } else {
        next.set(key, { x: x0, y, w: x1 - x0, h })
      }
    }

    done.push(...open.values())
    open = next
  }
  done.push(...open.values())

  return done.sort(compareRect)
}

function compareRect(a: Rect, b: Rect): number {

  return a.y - b.y || a.x - b.x
}

function indexOf(sorted: number[], value: number): number {

  let lo = 0
  let hi = sorted.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = sorted[mid]!
    if (v === value) {
      return mid
    }
    if (v < value) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  throw new Error(`grid coordinate ${value} not found`)
}
