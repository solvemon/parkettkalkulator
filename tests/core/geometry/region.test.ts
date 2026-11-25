import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { Rect } from '../../../src/core/model/types'
import { area, bbox, components, difference, fromRects, intersect, isEmpty, union } from '../../../src/core/geometry/region'
import { pixelArea, pixelSet, pixelsOf, smallRect } from './pixels'

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

describe('region', () => {
  it('GEO-001: a single rectangle is itself, with exact area', () => {
    const region = fromRects([r(0, 0, 7000, 4200)])

    expect(region).toEqual([r(0, 0, 7000, 4200)])
    expect(area(region)).toBe(29_400_000)
  })

  it('GEO-002: overlapping adds are unioned and the overlap is counted once', () => {
    const region = fromRects([r(0, 0, 100, 100), r(50, 50, 100, 100)])

    expect(area(region)).toBe(100 * 100 * 2 - 50 * 50)
  })

  it('GEO-003: two rects sharing a full edge become one rect and one component', () => {
    const region = fromRects([r(0, 0, 100, 50), r(0, 50, 100, 50)])

    expect(region).toEqual([r(0, 0, 100, 100)])
    expect(components(region)).toHaveLength(1)
  })

  it('GEO-004: rects touching only at a corner are two components', () => {
    const region = fromRects([r(0, 0, 100, 100), r(100, 100, 100, 100)])

    expect(components(region)).toHaveLength(2)
  })

  it('GEO-005: rects sharing a partial edge are connected', () => {
    const region = fromRects([r(0, 0, 100, 100), r(100, 99, 100, 100)])

    expect(components(region)).toHaveLength(1)
  })

  it('GEO-007: a subtract inside an add makes a hole and reduces the area', () => {
    const region = difference(fromRects([r(0, 0, 100, 100)]), fromRects([r(40, 40, 20, 20)]))

    expect(area(region)).toBe(10_000 - 400)
    expect(components(region)).toHaveLength(1)
  })

  it('GEO-012: overlapping subtracts are unioned', () => {
    const floor = fromRects([r(0, 0, 100, 100)])
    const holes = fromRects([r(10, 10, 30, 30), r(20, 20, 30, 30)])

    expect(area(difference(floor, holes))).toBe(10_000 - (900 * 2 - 400))
  })

  it('GEO-018: negative coordinates work the same as positive ones', () => {
    const region = fromRects([r(-500, -300, 200, 100), r(-300, -300, 100, 100)])

    expect(region).toEqual([r(-500, -300, 300, 100)])
    expect(bbox(region)).toEqual(r(-500, -300, 300, 100))
  })

  it('GEO-019: a 20 m × 15 m room has an exact integer area', () => {
    const region = difference(fromRects([r(0, 0, 20_000, 15_000)]), fromRects([r(1, 1, 1, 1)]))

    expect(area(region)).toBe(300_000_000 - 1)
  })

  it('GEO-020: 1 mm features are kept exactly', () => {
    const region = union(fromRects([r(0, 0, 1000, 1000)]), fromRects([r(1000, 500, 1, 1)]))

    expect(area(region)).toBe(1_000_001)
    expect(components(region)).toHaveLength(1)
  })

  it('empty inputs give an empty region', () => {
    expect(isEmpty(fromRects([]))).toBe(true)
    expect(isEmpty(difference(fromRects([r(0, 0, 10, 10)]), fromRects([r(-5, -5, 30, 30)])))).toBe(true)
    expect(components([])).toEqual([])
  })

  it('a ring has one component', () => {
    const ring = difference(fromRects([r(0, 0, 30, 30)]), fromRects([r(10, 10, 10, 10)]))

    expect(components(ring)).toHaveLength(1)
  })

  describe('properties (checked against a pixel bitmap)', () => {
    const rects = fc.array(smallRect, { maxLength: 5 })

    it('union, difference and intersect match pixel sets', () => {
      fc.assert(fc.property(rects, rects, (as, bs) => {
        const a = fromRects(as)
        const b = fromRects(bs)
        const pa = pixelSet(as)
        const pb = pixelSet(bs)

        expect(pixelsOf(union(a, b))).toEqual(new Set([...pa, ...pb]))
        expect(pixelsOf(difference(a, b))).toEqual(new Set([...pa].filter(p => !pb.has(p))))
        expect(pixelsOf(intersect(a, b))).toEqual(new Set([...pa].filter(p => pb.has(p))))
        expect(area(a)).toBe(pixelArea(as))
      }))
    })

    it('the canonical form does not depend on input order or splitting', () => {
      fc.assert(fc.property(rects, rects, (as, bs) => {
        expect(union(fromRects(as), fromRects(bs))).toEqual(union(fromRects(bs), fromRects(as)))
        expect(fromRects([...as, ...bs])).toEqual(fromRects(fromRects([...bs, ...as])))
      }))
    })

    it('rects in a region are disjoint', () => {
      fc.assert(fc.property(rects, as => {
        const region = fromRects(as)
        const total = region.reduce((sum, rect) => sum + rect.w * rect.h, 0)

        expect(total).toBe(pixelsOf(region).size)
      }))
    })

    it('components partition the region', () => {
      fc.assert(fc.property(rects, as => {
        const region = fromRects(as)
        const parts = components(region)

        expect(parts.reduce((sum, p) => sum + area(p), 0)).toBe(area(region))
        expect(fromRects(parts.flat())).toEqual(region)
      }))
    })
  })
})
