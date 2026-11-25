import { expect } from 'vitest'
import type { Project } from '../../../src/core/model/types'
import type { Layout } from '../../../src/core/model/layout'
import type { SolveResult } from '../../../src/core/solver/types'
import { validate } from '../../../src/core/validate/validate'

/**
 * The invariants every solver test checks: status ok, the validator finds no errors, planks ≥ the
 * lower bound, and solving again gives a deep-equal result.
 */
export function expectValidSolution(project: Project, solve: (p: Project) => SolveResult): Layout {

  const result = solve(project)

  expect(result.status, JSON.stringify(result.violations)).toBe('ok')
  const layout = result.layout!
  expect(validate(project, layout).filter(v => v.severity === 'error')).toEqual([])
  expect(layout.planks).toBeGreaterThanOrEqual(result.metrics!.lowerBound)
  expect(solve(project)).toEqual(result)

  return layout
}

export function pieceLengths(layout: Layout): number[][] {

  return layout.rows.map(r => r.segments.flatMap(s => s.pieces.map(p => p.x1 - p.x0)))
}
