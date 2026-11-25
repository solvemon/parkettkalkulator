import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { Rect } from '../../../src/core/model/types'
import { fromRects } from '../../../src/core/geometry/region'
import { grow, opening, shrink } from '../../../src/core/geometry/morph'
import { pixelSet, pixelsOf, smallRect } from './pixels'

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/** Pixels whose (2g+1)² square touches the set (grow) or lies fully inside it (shrink). */
function pixelMorph(rects: Rect[], g: number, mode: 'grow' | 'shrink'): Set<string> {

  const set = pixelSet(rects)
  const out = new Set<string>()
  for (let x = -20; x < 40; x++) {
    for (let y = -20; y < 40; y++) {
      let any = false
      let all = true
      for (let dx = -g; dx <= g; dx++) {
        for (let dy = -g; dy <= g; dy++) {
          const inside = set.has(`${x + dx},${y + dy}`)
          any ||= inside
          all &&= inside
        }
      }
      if (mode === 'grow' ? any : all) {
        out.add(`${x},${y}`)
      }
    }
  }

  return out
}

describe('morph', () => {
  it('grows a rect by g on every side', () => {
    expect(grow(fromRects([r(0, 0, 100, 50)]), 10)).toEqual([r(-10, -10, 120, 70)])
  })

  it('shrinks a rect by g on every side', () => {
    expect(shrink(fromRects([r(0, 0, 100, 50)]), 10)).toEqual([r(10, 10, 80, 30)])
  })

  it('g = 0 is the identity', () => {
    const region = fromRects([r(0, 0, 100, 50), r(0, 50, 30, 30)])

    expect(grow(region, 0)).toEqual(region)
    expect(shrink(region, 0)).toEqual(region)
  })

  it('GEO-013: shrinking an L-shaped room moves the inner corner correctly', () => {
    const lShape = fromRects([r(0, 0, 100, 50), r(0, 50, 50, 50)])

    expect(shrink(lShape, 10)).toEqual([r(10, 10, 80, 30), r(10, 40, 30, 50)])
  })

  it('shrinking a rect narrower than 2g makes it empty', () => {
    expect(shrink(fromRects([r(0, 0, 100, 19)]), 10)).toEqual([])
  })

  it('shrinking a ring grows its hole', () => {
    const ring = fromRects([r(0, 0, 100, 40), r(0, 60, 100, 40), r(0, 40, 40, 20), r(60, 40, 40, 20)])

    expect(shrink(ring, 5)).toEqual(fromRects([
      r(5, 5, 90, 30), r(5, 65, 90, 30), r(5, 35, 30, 30), r(65, 35, 30, 30),
    ]))
  })

  it('opening matches a pixel oracle (union of all fitting squares)', () => {
    fc.assert(fc.property(fc.array(smallRect, { maxLength: 4 }), fc.integer({ min: 1, max: 4 }), (rects, size) => {
      const set = pixelSet(rects)
      const expected = new Set<string>()
      for (let x = -10; x < 30; x++) {
        for (let y = -10; y < 30; y++) {
          const square: string[] = []
          for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
              square.push(`${x + dx},${y + dy}`)
            }
          }
          if (square.every(p => set.has(p))) {
            square.forEach(p => expected.add(p))
          }
        }
      }

      expect(pixelsOf(opening(fromRects(rects), size))).toEqual(expected)
    }), { numRuns: 200 })
  })

  it('grow and shrink match a pixel oracle', () => {
    fc.assert(fc.property(fc.array(smallRect, { maxLength: 4 }), fc.integer({ min: 0, max: 3 }), (rects, g) => {
      const region = fromRects(rects)

      expect(pixelsOf(grow(region, g))).toEqual(pixelMorph(rects, g, 'grow'))
      expect(pixelsOf(shrink(region, g))).toEqual(pixelMorph(rects, g, 'shrink'))
    }), { numRuns: 200 })
  })
})
