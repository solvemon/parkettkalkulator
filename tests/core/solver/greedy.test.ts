import { describe, expect, it } from 'vitest'
import { solveGreedy } from '../../../src/core/solver/greedy'
import { CW, P, r, testProject } from '../builders'
import { expectValidSolution, pieceLengths } from './invariants'

const solve = solveGreedy

describe('solveGreedy', () => {
  describe('OPT-004: hand-solved rooms', () => {
    it.each([
      [2413, 228, 1],
      [2413, 456, 2],
      [2000, 456, 2],
      [3000, 456, 3],
      [4826, 456, 5],
      [4826, 684, 7],
    ])('%i × %i needs %i planks', (w, h, planks) => {
      const layout = expectValidSolution(testProject(r(0, 0, w, h)), solve)

      expect(layout.planks).toBe(planks)
    })
  })

  describe('packing', () => {
    it('PCK-002: a segment of two plank lengths is two full planks', () => {
      const layout = expectValidSolution(testProject(r(0, 0, 2 * P, CW)), solve)

      expect(pieceLengths(layout)).toEqual([[P, P]])
    })

    it('PCK-003: a segment slightly longer than a plank gets no piece below minPieceLength', () => {
      const layout = expectValidSolution(testProject(r(0, 0, P + 100, CW)), solve)

      expect(pieceLengths(layout)[0]!.every(len => len >= 300)).toBe(true)
      expect(layout.planks).toBe(2)
    })

    it('PCK-004: a room shorter than minPieceLength is infeasible, without throwing', () => {
      const result = solve(testProject(r(0, 0, 250, CW)))

      expect(result.status).toBe('infeasible')
      expect(result.violations[0]?.detail).toMatch(/shorter than the minimum piece/)
    })

    it('PCK-010: an offcut matching the needed start length is reused', () => {
      const layout = expectValidSolution(testProject(r(0, 0, 3000, 2 * CW)), solve)

      const rowOneStart = layout.rows[1]!.segments[0]!.pieces[0]!
      expect(rowOneStart.source).toEqual({ plank: 1, from: 590, to: P })
    })

    it('PCK-011: an L offcut 3 mm too short for the row end is not used', () => {
      const layout = expectValidSolution(testProject(r(0, 0, 2 * P, 2 * CW)), solve)

      const rowOneEnd = layout.rows[1]!.segments[0]!.pieces.at(-1)!
      expect(rowOneEnd.x1 - rowOneEnd.x0).toBe(500)
      expect(rowOneEnd.source.plank).toBe(4)
    })

    it('PCK-012: an offcut shorter than minPieceLength is waste and never placed', () => {
      const layout = expectValidSolution(testProject(r(0, 0, 2200, 2 * CW)), solve)

      expect(layout.planks).toBe(2)
      expect(pieceLengths(layout).flat().every(len => len >= 300)).toBe(true)
    })
  })

  describe('rows', () => {
    it('ROW-001: a room exactly n × coverWidth wide is laid with no rip', () => {
      const layout = expectValidSolution(testProject(r(0, 0, P, 3 * CW)), solve)

      expect(layout.rip).toBe(CW)
      expect(layout.rows.map(row => row.y1 - row.y0)).toEqual([CW, CW, CW])
    })

    it('ROW-002: a small remainder forces a rip so the last row is at least minRipWidth', () => {
      const layout = expectValidSolution(testProject(r(0, 0, P, 2 * CW + 20)), solve)

      expect(layout.rip).toBeLessThan(CW)
      expect(Math.min(...layout.rows.map(row => row.y1 - row.y0))).toBeGreaterThanOrEqual(50)
    })

    it('ROW-003: a room narrower than one coverWidth is a single ripped row', () => {
      const layout = expectValidSolution(testProject(r(0, 0, P, 150)), solve)

      expect(layout.rows).toHaveLength(1)
      expect(layout.rip).toBe(150)
    })

    it('ROW-004: a room narrower than minRipWidth is infeasible', () => {
      const result = solve(testProject(r(0, 0, P, 40)))

      expect(result.status).toBe('infeasible')
      expect(result.violations[0]?.detail).toMatch(/narrower than the minimum rip/)
    })

    it('ROW-006: a rip that leaves a sliver at an obstacle is rejected and another rip is chosen', () => {
      // The obstacle's edge is 1 mm inside the band of the no-rip layout.
      const project = testProject(r(0, 0, 3000, 3 * CW), [r(0, CW + 1, 1000, 2 * CW - 1)])

      const layout = expectValidSolution(project, solve)

      expect(layout.rip).not.toBe(CW)
    })

    it('ROW-007: an obstacle blocking a band gives two segments', () => {
      const layout = expectValidSolution(testProject(r(0, 0, 3000, 2 * CW), [r(1000, 0, 400, CW)]), solve)

      expect(layout.rows[0]!.segments.map(s => [s.x0, s.x1])).toEqual([[0, 1000], [1400, 3000]])
    })

    it('ROW-008: an obstacle partly covering a band gives notched pieces', () => {
      expectValidSolution(testProject(r(0, 0, 3000, 2 * CW), [r(1000, 0, 400, 100)]), solve)
    })
  })

  describe('pins', () => {
    const base = testProject(r(0, 0, 4000, 3 * CW))

    it('PIN-001: a valid pinned rip is used exactly', () => {
      const layout = expectValidSolution({ ...base, pins: { firstRowRip: 100, rowStartLengths: {} } }, solve)

      expect(layout.rip).toBe(100)
    })

    it('PIN-002: a pinned rip below minRipWidth is reported, not thrown', () => {
      const result = solve({ ...base, pins: { firstRowRip: 30, rowStartLengths: {} } })

      expect(result.status).toBe('infeasible')
      expect(result.debug.rips).toEqual([expect.objectContaining({ rip: 30, outcome: 'skipped' })])
    })

    it('PIN-003: a pinned row-0 start length is used', () => {
      const layout = expectValidSolution({ ...base, pins: { firstRowRip: null, rowStartLengths: { 0: 1000 } } }, solve)

      expect(pieceLengths(layout)[0]![0]).toBe(1000)
    })
  })

  it('reports an invalid room', () => {
    const result = solve(testProject(r(0, 0, 3000, 1000), [r(0, 400, 3000, 200)]))

    expect(result.status).toBe('invalid-room')
    expect(result.violations.map(v => v.rule)).toEqual(['disconnected'])
  })

  it('records every rip it tried for debugging', () => {
    const result = solve(testProject(r(0, 0, 3000, 2 * CW + 20)))

    expect(result.debug.rips[0]).toEqual({ rip: CW, outcome: 'skipped', reason: 'last row would be 20 mm' })
    expect(result.debug.rips.some(a => a.outcome === 'ok')).toBe(true)
  })

  it.each(['top-right', 'bottom-left', 'bottom-right'] as const)('TRF-003: start corner %s gives the same plank count for a symmetric room', corner => {
    const project = testProject(r(0, 0, 4826, 684))
    const layout = expectValidSolution({ ...project, layout: { direction: 'x', startCorner: corner } }, solve)

    expect(layout.planks).toBe(7)
  })

  it('direction y works', () => {
    const project = testProject(r(0, 0, 684, 4826))
    const layout = expectValidSolution({ ...project, layout: { direction: 'y', startCorner: 'top-left' } }, solve)

    expect(layout.planks).toBe(7)
  })
})
