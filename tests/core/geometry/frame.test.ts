import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { LayoutSettings, Rect, StartCorner } from '../../../src/core/model/types'
import { frameFor, rectToSolver, rectToWorld, regionToSolver } from '../../../src/core/geometry/frame'
import { fromRects } from '../../../src/core/geometry/region'
import { smallRect } from './pixels'

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
const corners: StartCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const settings: LayoutSettings[] = (['x', 'y'] as const).flatMap(direction => corners.map(startCorner => ({ direction, startCorner })))

/** A 3000 × 1000 room with a 100 × 100 marker block in the world's top-left corner. */
const room = fromRects([r(0, 0, 3000, 1000)])
const marker = r(0, 0, 100, 100)

describe('frame', () => {
  it.each(settings)('TRF-001/TRF-002: round-trips every rect (%o)', layout => {
    const frame = frameFor(layout)

    fc.assert(fc.property(smallRect, rect => {
      expect(rectToWorld(frame, rectToSolver(frame, rect))).toEqual(rect)
    }))
  })

  it('direction x from the top-left is the identity', () => {
    const frame = frameFor({ direction: 'x', startCorner: 'top-left' })

    expect(rectToSolver(frame, r(10, 20, 30, 40))).toEqual(r(10, 20, 30, 40))
  })

  it.each([
    ['x', 'top-left', true],
    ['x', 'top-right', false],
    ['y', 'top-left', true],
    ['y', 'bottom-left', false],
  ] as const)('the start corner (%s, %s) becomes the solver top-left: marker there = %s', (direction, startCorner, atStart) => {
    const frame = frameFor({ direction, startCorner })
    const solverRoom = regionToSolver(frame, room)
    const m = rectToSolver(frame, marker)
    const minX = Math.min(...solverRoom.map(q => q.x))
    const minY = Math.min(...solverRoom.map(q => q.y))

    expect(m.x === minX && m.y === minY).toBe(atStart)
  })

  it('TRF-001: direction y makes planks run along world y', () => {
    const frame = frameFor({ direction: 'y', startCorner: 'top-left' })

    // A plank-shaped rect in the solver frame (long along x) is long along world y.
    const world = rectToWorld(frame, r(0, 0, 2413, 228))

    expect(world).toEqual(r(0, 0, 228, 2413))
  })
})
