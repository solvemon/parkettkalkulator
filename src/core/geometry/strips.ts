import type { Rect } from '../model/types'
import type { Region } from './region'

export interface Interval {
  x0: number
  x1: number
}

/** The x-projection of a region as maximal merged intervals, sorted. */
export function xIntervals(region: Region): Interval[] {

  return mergeIntervals(region.map(r => ({ x0: r.x, x1: r.x + r.w })))
}

/** The material at column x: maximal y-intervals, sorted. Empty if the column is blocked. */
export function stripsAt(region: Region, x: number): Interval[] {

  const covering = region.filter(r => r.x <= x && x < r.x + r.w)

  return mergeIntervals(covering.map(r => ({ x0: r.y, x1: r.y + r.h })))
}

/**
 * Parts of a region where some vertical strip of material (measured across, along y) is
 * thinner than `minWidth`. Returned as rects for highlighting; empty means everything is fine.
 */
export function narrowStrips(region: Region, minWidth: number): Rect[] {

  const xs = [...new Set(region.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b)
  const out: Rect[] = []

  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i]!
    const xb = xs[i + 1]!
    for (const strip of stripsAt(region, xa)) {
      if (strip.x1 - strip.x0 < minWidth) {
        out.push({ x: xa, y: strip.x0, w: xb - xa, h: strip.x1 - strip.x0 })
      }
    }
  }

  return out
}

export function mergeIntervals(intervals: Interval[]): Interval[] {

  const sorted = intervals.filter(i => i.x1 > i.x0).sort((a, b) => a.x0 - b.x0)
  const out: Interval[] = []

  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.x0 <= last.x1) {
      last.x1 = Math.max(last.x1, i.x1)
    } else {
      out.push({ ...i })
    }
  }

  return out
}

/** Intersection of two sorted lists of disjoint intervals. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {

  const out: Interval[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    const p = a[i]!
    const q = b[j]!
    const x0 = Math.max(p.x0, q.x0)
    const x1 = Math.min(p.x1, q.x1)
    if (x1 > x0) {
      out.push({ x0, x1 })
    }
    if (p.x1 < q.x1) {
      i++
    } else {
      j++
    }
  }

  return out
}
