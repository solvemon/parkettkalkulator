import { describe, expect, it } from 'vitest'
import { parseProject } from '../../../src/core/model/parse'
import { DEFAULT_RULES } from '../../../src/core/model/defaults'

function minimalJson(): Record<string, unknown> {
  return {
    version: 1,
    id: 'p1',
    name: 'Stue',
    room: {
      wallGap: 10,
      shapes: [{ id: 'a1', op: 'add', x: 0, y: 0, w: 4000, h: 3000 }],
    },
    plank: { length: 2413, width: 232, coverWidth: 228, kerf: 3, planksPerPack: 6 },
  }
}

describe('parseProject', () => {
  it('parses a minimal valid project', () => {
    const result = parseProject(minimalJson())

    expect(result.ok).toBe(true)
  })

  it('MIG-002: rejects a version newer than the app supports', () => {
    const json = { ...minimalJson(), version: 99 }

    const result = parseProject(json)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toMatch(/newer/)
    }
  })

  it('MIG-003: fills in defaults for missing optional fields', () => {
    const result = parseProject(minimalJson())

    if (!result.ok) {
      throw new Error(result.errors.join())
    }
    expect(result.project.rules).toEqual(DEFAULT_RULES)
    expect(result.project.layout).toEqual({ direction: 'x', startCorner: 'top-left' })
    expect(result.project.pins).toEqual({ firstRowRip: null, rowStartLengths: {} })
  })

  it('MIG-003: subtract gap stays missing so it inherits wallGap later', () => {
    const json = minimalJson()
    ;(json.room as { shapes: unknown[] }).shapes.push({ id: 's1', op: 'subtract', x: 1, y: 1, w: 10, h: 10 })

    const result = parseProject(json)

    if (!result.ok) {
      throw new Error(result.errors.join())
    }
    expect(result.project.room.shapes[1]?.gap).toBeUndefined()
  })

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['missing room', { ...minimalJson(), room: undefined }],
    ['shapes not an array', { ...minimalJson(), room: { wallGap: 0, shapes: 'x' } }],
    ['plank length a string', { ...minimalJson(), plank: { length: '2413', coverWidth: 228 } }],
    ['non-integer coordinate', { ...minimalJson(), room: { wallGap: 0, shapes: [{ id: 'a', op: 'add', x: 0.5, y: 0, w: 10, h: 10 }] } }],
    ['unknown op', { ...minimalJson(), room: { wallGap: 0, shapes: [{ id: 'a', op: 'xor', x: 0, y: 0, w: 10, h: 10 }] } }],
    ['bad direction', { ...minimalJson(), layout: { direction: 'z', startCorner: 'top-left' } }],
    ['missing version', { ...minimalJson(), version: undefined }],
  ])('MIG-004: rejects invalid input (%s)', (_label, json) => {
    const result = parseProject(json)

    expect(result.ok).toBe(false)
  })

  it.each([
    ['w = 0', { w: 0, h: 10 }],
    ['h = 0', { w: 10, h: 0 }],
    ['negative w', { w: -5, h: 10 }],
  ])('GEO-006: rejects a shape with %s', (_label, size) => {
    const json = minimalJson()
    json.room = { wallGap: 0, shapes: [{ id: 'a1', op: 'add', x: 0, y: 0, ...size }] }

    const result = parseProject(json)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join()).toMatch(/a1/)
    }
  })

  it('MIG-005: export → import round-trip gives a deep-equal project', () => {
    const first = parseProject(minimalJson())
    if (!first.ok) {
      throw new Error(first.errors.join())
    }

    const second = parseProject(JSON.parse(JSON.stringify(first.project)))

    expect(second).toEqual(first)
  })
})
