import { describe, expect, it } from 'vitest'
import type { Rect } from '../../../src/core/model/types'
import { difference, fromRects } from '../../../src/core/geometry/region'
import { narrowStrips } from '../../../src/core/geometry/strips'
import { pieceShape, pieceShapeProblems, rowBoundaries, sliceRows } from '../../../src/core/rows/rows'

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
const CW = 228
const MIN_RIP = 50

/** A room with holes cut out, in the solver frame. */
const room = (w: number, h: number, ...holes: Rect[]) => difference(fromRects([r(0, 0, w, h)]), fromRects(holes))
const kinds = (problems: { kind: string }[]) => problems.map(p => p.kind)

describe('rowBoundaries', () => {
  it('stacks a ripped first row, full rows, then the remainder', () => {
    expect(rowBoundaries(0, 600, 100, CW)).toEqual([0, 100, 328, 556, 600])
  })

  it('ROW-001: a room of exactly n × coverWidth with no rip gives n full rows', () => {
    expect(rowBoundaries(0, 3 * CW, CW, CW)).toEqual([0, 228, 456, 684])
  })

  it('ROW-003: a room narrower than one coverWidth is a single row', () => {
    expect(rowBoundaries(0, 150, CW, CW)).toEqual([0, 150])
  })
})

describe('sliceRows', () => {
  it('ROW-002: without a rip, a small remainder makes a last row thinner than minRipWidth', () => {
    const bands = sliceRows(room(3000, 2 * CW + 20), CW, CW)
    const last = bands[bands.length - 1]!

    expect(last.y1 - last.y0).toBe(20)
    expect(narrowStrips(last.region, MIN_RIP)).not.toEqual([])
  })

  it('ROW-004: a room narrower than minRipWidth is too narrow in its only row', () => {
    const bands = sliceRows(room(3000, 40), CW, CW)

    expect(bands).toHaveLength(1)
    expect(kinds(pieceShapeProblems(bands[0]!, 0, 3000, MIN_RIP))).toEqual(['narrow'])
  })

  it('ROW-005: an obstacle edge exactly on a row boundary leaves no notch in either row', () => {
    const bands = sliceRows(room(3000, 2 * CW, r(1000, CW, 200, CW)), CW, CW)

    expect(bands[0]!.region).toEqual([r(0, 0, 3000, CW)])
    expect(bands[0]!.segments).toEqual([{ x0: 0, x1: 3000 }])
    expect(bands[1]!.segments).toEqual([{ x0: 0, x1: 1000 }, { x0: 1200, x1: 3000 }])
  })

  it('ROW-006: an obstacle edge 1 mm inside a band leaves a 1 mm sliver that is rejected', () => {
    const band = sliceRows(room(3000, 2 * CW, r(1000, 1, 200, CW + 50)), CW, CW)[0]!

    expect(band.segments).toEqual([{ x0: 0, x1: 3000 }])
    expect(kinds(pieceShapeProblems(band, 0, 2000, MIN_RIP))).toEqual(['narrow'])
  })

  it('ROW-007: an obstacle fully blocking a band splits it into two segments', () => {
    const band = sliceRows(room(3000, CW, r(1000, 0, 200, CW)), CW, CW)[0]!

    expect(band.segments).toEqual([{ x0: 0, x1: 1000 }, { x0: 1200, x1: 3000 }])
  })

  it('ROW-008: an obstacle partly covering a band keeps one segment; the piece gets a notch', () => {
    const band = sliceRows(room(3000, CW, r(1000, 100, 200, 200)), CW, CW)[0]!

    expect(band.segments).toEqual([{ x0: 0, x1: 3000 }])
    expect(pieceShape(band, 500, 2000)).toEqual([r(500, 0, 1500, 100), r(500, 100, 500, CW - 100), r(1200, 100, 800, CW - 100)])
    expect(pieceShapeProblems(band, 500, 2000, MIN_RIP)).toEqual([])
  })

  it('ROW-009: a pipe inside a band gives a piece with a hole when there is enough material either side', () => {
    const band = sliceRows(room(3000, CW, r(1000, 80, 30, 30)), CW, CW)[0]!

    expect(pieceShapeProblems(band, 0, 2000, MIN_RIP)).toEqual([])
  })

  it('ROW-009: a pipe too close to the band edge is rejected', () => {
    const band = sliceRows(room(3000, CW, r(1000, 30, 30, 30)), CW, CW)[0]!

    expect(kinds(pieceShapeProblems(band, 0, 2000, MIN_RIP))).toEqual(['narrow'])
  })

  it('ROW-010: a wall jog in the middle of the last row gives an L-shaped piece', () => {
    const region = fromRects([r(0, 0, 3000, CW), r(0, CW, 1500, CW), r(1500, CW, 1500, 100)])
    const last = sliceRows(region, CW, CW)[1]!

    expect(last.segments).toEqual([{ x0: 0, x1: 3000 }])
    expect(pieceShapeProblems(last, 1000, 2000, MIN_RIP)).toEqual([])
  })

  it('ROW-011: a piece whose material is two separate strips along its whole length is rejected', () => {
    const band = sliceRows(room(3000, CW, r(0, 90, 3000, 50)), CW, CW)[0]!

    expect(band.segments).toEqual([{ x0: 0, x1: 3000 }])
    expect(kinds(pieceShapeProblems(band, 0, 2000, MIN_RIP))).toEqual(['split'])
  })
})
