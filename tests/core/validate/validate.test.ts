import { describe, expect, it } from 'vitest'
import { validate } from '../../../src/core/validate/validate'
import { CW, P, layout, r, row, run, seg, testProject } from '../builders'

const rules = (violations: { rule: string }[]) => violations.map(v => v.rule)

describe('validate', () => {
  describe('basic coverage', () => {
    it('PCK-001: a segment exactly one plank long is one full plank', () => {
      const project = testProject(r(0, 0, P, CW))
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, P]])])])

      expect(validate(project, lay)).toEqual([])
    })

    it('reports pieces that stop short of the segment end', () => {
      const project = testProject(r(0, 0, 3000, CW))
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, P]])])])

      expect(rules(validate(project, lay))).toContain('coverage')
    })

    it('reports a wrong row stacking', () => {
      const project = testProject(r(0, 0, P, 2 * CW))
      const lay = layout(project, CW, [row(0, 0, 2 * CW, [seg(0, [[0, 0, P]])])])

      expect(rules(validate(project, lay))).toEqual(['rows'])
    })

    it('ROW-012: a cut end where an obstacle only partly blocks the band is not allowed', () => {
      const project = testProject(r(0, 0, 3000, CW), [r(1000, 0, 200, 100)])
      // Treat x = 1000 as a segment end even though the band is only partly blocked there.
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 1413, P]]), seg(1000, [[1, 0, 2000]])])])

      expect(rules(validate(project, lay))).toContain('coverage')
    })

    it('reports room errors instead of checking the layout', () => {
      const project = testProject(r(0, 0, 1000, 1000), [r(0, 400, 1000, 200)])
      const lay = layout(project, CW, [])

      expect(rules(validate(project, lay))).toEqual(['disconnected'])
    })
  })

  describe('end types', () => {
    const project = testProject(r(0, 0, 3000, CW))

    it('accepts an R-piece start and an L-piece end', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, P - 1500, P], [1, 0, 1500]])])])

      expect(validate(project, lay)).toEqual([])
    })

    it('PCK-007: an R-piece at the end of a multi-piece segment is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, P - 1500, P], [1, P - 1500, P]])])])

      expect(rules(validate(project, lay))).toEqual(['end-type'])
    })

    it('PCK-008: an L-piece at the start of a multi-piece segment is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, 1500], [1, 0, 1500]])])])

      expect(rules(validate(project, lay))).toEqual(['end-type'])
    })

    it('PCK-009: a C-piece inside a multi-piece segment is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 100, 1600], [1, 0, 1500]])])])

      expect(rules(validate(project, lay))).toEqual(['end-type'])
    })

    it('PCK-005: a C-piece alone in a segment shorter than a plank is fine', () => {
      const short = testProject(r(0, 0, 1500, CW))
      const lay = layout(short, CW, [row(0, 0, CW, [seg(0, [[0, 100, 1600]])])])

      expect(validate(short, lay)).toEqual([])
    })
  })

  describe('min piece length and material', () => {
    const project = testProject(r(0, 0, 3000, CW))

    it('PCK-004: a piece shorter than minPieceLength is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, P - 200, P], [1, 0, P], [2, 0, 387]])])])

      expect(rules(validate(project, lay))).toEqual(['min-piece-length'])
    })

    it('PCK-006: two pieces from one plank need a kerf between them', () => {
      const ok = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 1203, P], [0, 0, 1200], [1, 0, 590]])])])
      const tight = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 1202, P], [0, 0, 1200], [1, 0, 589]])])])

      expect(rules(validate(project, ok))).not.toContain('material')
      expect(rules(validate(project, tight))).toContain('material')
    })

    it('material used twice is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 1000, P], [0, 0, 1587]])])])

      expect(rules(validate(project, lay))).toContain('material')
    })

    it('a source outside the plank is rejected', () => {
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, -587, P]])])])

      expect(rules(validate(project, lay))).toContain('material')
    })
  })

  describe('min width', () => {
    it('ROW-006: a 1 mm sliver of material is rejected', () => {
      const project = testProject(r(0, 0, P, CW), [r(1000, 1, 200, CW)])
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, P]])])])

      expect(rules(validate(project, lay))).toEqual(['min-width'])
    })

    it('ROW-011: a piece that falls apart into two strips is rejected', () => {
      const project = testProject(r(0, 0, 3000, CW), [r(0, 90, P, 50)])
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, P], [1, 0, 3000 - P]])])])

      expect(rules(validate(project, lay))).toEqual(['min-width'])
    })

    it('the violation carries highlight rects in world coordinates', () => {
      const project = testProject(r(0, 0, P, CW), [r(1000, 1, 200, CW)])
      const lay = layout(project, CW, [row(0, 0, CW, [seg(0, [[0, 0, P]])])])

      expect(validate(project, lay)[0]?.rects).toEqual([r(1000, 0, 200, 1)])
    })
  })

  describe('stagger', () => {
    const project = testProject(r(0, 0, 2 * P, 2 * CW))
    const twoRows = (s0: number, s1: number) => layout(project, CW, [
      row(0, 0, CW, [seg(0, run(2 * P, s0, 0))]),
      row(1, CW, 2 * CW, [seg(0, run(2 * P, s1, 10), 1)]),
    ])

    it('STG-001: joints 499 mm apart in adjacent rows are a violation', () => {
      expect(rules(validate(project, twoRows(1000, 1499)))).toEqual(['stagger', 'stagger'])
    })

    it('STG-002: joints exactly 500 mm apart are allowed', () => {
      expect(validate(project, twoRows(1000, 1500))).toEqual([])
    })

    it('STG-003: a joint aligned with a segment end in the next row is not a violation', () => {
      const withObstacle = testProject(r(0, 0, 2 * P, 2 * CW), [r(1000, 0, 200, CW)])
      const lay = layout(withObstacle, CW, [
        row(0, 0, CW, [seg(0, [[0, 0, 1000]]), seg(1200, [[1, 1200, P], [2, 0, P]])]),
        row(1, CW, 2 * CW, [seg(0, run(2 * P, 1000, 10), 1)]),
      ])

      expect(validate(withObstacle, lay)).toEqual([])
    })

    it('STG-004: joints separated by an obstacle on the row boundary are not compared', () => {
      const open = testProject(r(0, 0, 3000, 2 * CW))
      const blocked = testProject(r(0, 0, 3000, 2 * CW), [r(900, 170, 700, 116)])
      const lay = (p: typeof blocked) => layout(p, CW, [
        row(0, 0, CW, [seg(0, run(3000, 1050, 0))]),
        row(1, CW, 2 * CW, [seg(0, run(3000, 1450, 10), 1)]),
      ])

      expect(rules(validate(blocked, lay(blocked)))).toEqual([])
      expect(rules(validate(open, lay(open)))).toEqual(['stagger'])
    })

    describe('second row', () => {
      const three = testProject(r(0, 0, 2 * P, 3 * CW))
      const threeRows = layout(three, CW, [
        row(0, 0, CW, [seg(0, run(2 * P, 1000, 0))]),
        row(1, CW, 2 * CW, [seg(0, run(2 * P, 1700, 10), 1)]),
        row(2, 2 * CW, 3 * CW, [seg(0, run(2 * P, 1100, 20), 2)]),
      ])

      it('STG-005: with the rule off, rows k and k+2 are not compared', () => {
        expect(validate(three, threeRows)).toEqual([])
      })

      it('STG-006: with the rule on, rows k and k+2 are checked', () => {
        const strict = { ...three, rules: { ...three.rules, minJointOffsetSecondRow: 200 } }

        expect(rules(validate(strict, threeRows))).toEqual(['stagger-second-row', 'stagger-second-row'])
      })
    })
  })

  describe('pins', () => {
    const base = testProject(r(0, 0, 3000, CW))
    const lay = layout(base, CW, [row(0, 0, CW, [seg(0, [[0, P - 1500, P], [1, 0, 1500]])])])

    it('a satisfied pin gives no violation', () => {
      const pinned = { ...base, pins: { firstRowRip: CW, rowStartLengths: { 0: 1500 } } }

      expect(validate(pinned, lay)).toEqual([])
    })

    it('a pinned rip that differs is a violation', () => {
      const pinned = { ...base, pins: { firstRowRip: 100, rowStartLengths: {} } }

      expect(rules(validate(pinned, lay))).toEqual(['pin'])
    })

    it('a pinned start length that differs is a violation', () => {
      const pinned = { ...base, pins: { firstRowRip: null, rowStartLengths: { 0: 1000 } } }

      expect(rules(validate(pinned, lay))).toEqual(['pin'])
    })

    it('PIN-005: a pin on a row that does not exist is a warning', () => {
      const pinned = { ...base, pins: { firstRowRip: null, rowStartLengths: { 7: 1000 } } }

      expect(validate(pinned, lay)).toEqual([expect.objectContaining({ rule: 'pin-ignored', severity: 'warning' })])
    })
  })
})
