import { describe, expect, it } from 'vitest'
import type { Project, Rect, Shape } from '../../../src/core/model/types'
import { DEFAULT_LAYOUT, DEFAULT_PLANK, DEFAULT_RULES, defaultPins } from '../../../src/core/model/defaults'
import { computeLayable } from '../../../src/core/layable/layable'
import { area, bbox, components, difference, fromRects } from '../../../src/core/geometry/region'
import type { Region } from '../../../src/core/geometry/region'

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
const add = (id: string, x: number, y: number, w: number, h: number): Shape => ({ id, op: 'add', x, y, w, h })
const sub = (id: string, x: number, y: number, w: number, h: number, gap?: number): Shape =>
  gap === undefined ? { id, op: 'subtract', x, y, w, h } : { id, op: 'subtract', x, y, w, h, gap }

function project(shapes: Shape[], wallGap = 0): Project {
  return {
    version: 1,
    id: 'p',
    name: 'test',
    room: { wallGap, shapes },
    plank: DEFAULT_PLANK,
    layout: DEFAULT_LAYOUT,
    rules: DEFAULT_RULES,
    pins: defaultPins(),
  }
}

function holeCount(region: Region): number {
  const box = bbox(region)!
  const outer = fromRects([r(box.x - 1, box.y - 1, box.w + 2, box.h + 2)])

  return components(difference(outer, region)).length - 1
}

const rules = (result: ReturnType<typeof computeLayable>) => result.issues.map(i => i.rule)

describe('computeLayable', () => {
  it('GEO-001: a single rect with no gap is layable as-is', () => {
    const result = computeLayable(project([add('a', 0, 0, 7000, 4200)]))

    expect(result.region).toEqual([r(0, 0, 7000, 4200)])
    expect(result.issues).toEqual([])
  })

  it('applies the wall gap on every wall', () => {
    const result = computeLayable(project([add('a', 0, 0, 7000, 4200)], 10))

    expect(result.region).toEqual([r(10, 10, 6980, 4180)])
  })

  it('GEO-007: an obstacle inside the room makes a hole, grown by its gap', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 400, 400, 200, 200, 10)]))

    expect(area(result.region)).toBe(1_000_000 - 220 * 220)
    expect(holeCount(result.region)).toBe(1)
    expect(result.issues).toEqual([])
  })

  it('GEO-008: a subtract touching a wall becomes a notch, not a hole', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 0, 400, 200, 200, 0)]))

    expect(area(result.region)).toBe(1_000_000 - 40_000)
    expect(holeCount(result.region)).toBe(0)
  })

  it('GEO-009: a subtract splitting the floor in two is a disconnected error', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 0, 400, 1000, 200, 0)]))

    const issue = result.issues.find(i => i.rule === 'disconnected')
    expect(issue?.severity).toBe('error')
    expect(issue?.rects).toEqual([r(0, 0, 1000, 400), r(0, 600, 1000, 400)])
  })

  it('GEO-004: adds touching only at a corner are disconnected', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), add('b', 1000, 1000, 1000, 1000)]))

    expect(rules(result)).toContain('disconnected')
  })

  it('GEO-010: a subtract covering everything is an empty error', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', -10, -10, 2000, 2000, 0)]))

    expect(result.region).toEqual([])
    expect(result.issues).toEqual([expect.objectContaining({ rule: 'empty', severity: 'error' })])
  })

  it('a project without adds is empty', () => {
    expect(rules(computeLayable(project([])))).toEqual(['empty'])
  })

  it('GEO-011: a subtract outside every add has no effect and gives a warning', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 2000, 0, 100, 100, 10)]))

    expect(result.region).toEqual([r(0, 0, 1000, 1000)])
    expect(result.issues).toEqual([
      expect.objectContaining({ rule: 'subtract-outside', severity: 'warning', shapeId: 's' }),
    ])
  })

  it('GEO-014: a corridor narrower than 2 × wallGap splits the floor', () => {
    const shapes = [add('a', 0, 0, 1000, 1000), add('c', 1000, 400, 500, 15), add('b', 1500, 0, 1000, 1000)]

    expect(rules(computeLayable(project(shapes, 10)))).toContain('disconnected')
    expect(rules(computeLayable(project(shapes, 0)))).not.toContain('disconnected')
  })

  it('GEO-015: an obstacle gap overlapping the wall gap merges into one notch', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 15, 400, 100, 100, 10)], 10))

    expect(result.region).toEqual(fromRects([r(10, 10, 980, 380), r(125, 390, 865, 120), r(10, 510, 980, 480)]))
    expect(holeCount(result.region)).toBe(0)
    expect(result.region.every(rect => rect.w > 0 && rect.h > 0)).toBe(true)
  })

  it('GEO-016: an obstacle without a gap inherits wallGap', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('s', 400, 400, 100, 100)], 10))

    expect(area(result.region)).toBe(980 * 980 - 120 * 120)
  })

  it('GEO-017: obstacle gap 0 next to wallGap 10 each use their own gap', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), sub('pipe', 400, 400, 20, 20, 0)], 10))

    expect(area(result.region)).toBe(980 * 980 - 20 * 20)
  })

  it('GEO-021: a part where no minRipWidth square fits gives a warning', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), add('nub', 1000, 0, 30, 40)]))

    const issue = result.issues.find(i => i.rule === 'too-narrow')
    expect(issue?.severity).toBe('warning')
    expect(issue?.rects).toEqual([r(1000, 0, 30, 40)])
  })

  it('a thin strip exactly minRipWidth wide is not too narrow', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), add('strip', 1000, 0, 50, 50)]))

    expect(rules(result)).not.toContain('too-narrow')
  })

  it('an invalid shape is reported, not thrown', () => {
    const result = computeLayable(project([add('a', 0, 0, 1000, 1000), add('bad', 0, 0, 0, 100)]))

    expect(result.issues).toContainEqual(expect.objectContaining({ rule: 'invalid-shape', shapeId: 'bad' }))
  })
})
