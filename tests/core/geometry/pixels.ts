import fc from 'fast-check'
import type { Rect } from '../../../src/core/model/types'

/** Brute-force oracle: a region as the set of 1×1 mm pixels it covers ("x,y" keys). */
export function pixelSet(rects: Rect[]): Set<string> {

  const set = new Set<string>()
  for (const rect of rects) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        set.add(`${x},${y}`)
      }
    }
  }

  return set
}

export function pixelsOf(region: Rect[]): Set<string> {

  return pixelSet(region)
}

export function pixelArea(rects: Rect[]): number {

  return pixelSet(rects).size
}

/** Small rects on a 0..20 grid, so brute-force pixel sets stay cheap. */
export const smallRect: fc.Arbitrary<Rect> = fc.record({
  x: fc.integer({ min: -5, max: 15 }),
  y: fc.integer({ min: -5, max: 15 }),
  w: fc.integer({ min: 1, max: 10 }),
  h: fc.integer({ min: 1, max: 10 }),
})
