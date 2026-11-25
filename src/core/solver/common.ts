import type { Project } from '../model/types'
import { computeLayable } from '../layable/layable'
import { frameFor, regionToSolver } from '../geometry/frame'
import type { Frame } from '../geometry/frame'
import { area } from '../geometry/region'
import type { Region } from '../geometry/region'
import type { SolveOptions, SolveResult } from './types'

export interface Prepared {
  frame: Frame
  /** Layable region in the solver frame. */
  region: Region
  layableArea: number
  /** The region's extent across the rows (solver y). */
  height: number
}

/** Layable region in the solver frame, or an `invalid-room` result. */
export function prepare(project: Project, solver: 'greedy' | 'beam'): Prepared | SolveResult {

  const layable = computeLayable(project)
  const errors = layable.issues.filter(i => i.severity === 'error')
  if (errors.length > 0) {
    return { status: 'invalid-room', violations: errors, explored: 0, debug: { solver, rips: [] } }
  }

  const frame = frameFor(project.layout)
  const region = regionToSolver(frame, layable.region)
  const y0 = Math.min(...region.map(r => r.y))
  const y1 = Math.max(...region.map(r => r.y + r.h))

  return { frame, region, layableArea: area(layable.region), height: y1 - y0 }
}

export function isResult(value: Prepared | SolveResult): value is SolveResult {

  return 'status' in value
}

/**
 * First-row rip candidates, best guesses first: no rip, the rip that makes the last row full,
 * the rip that balances the first and last rows, then a grid in `ripStep` steps.
 * A pinned rip is the only candidate.
 */
export function ripCandidates(project: Project, height: number, options: SolveOptions): number[] {

  const { coverWidth } = project.plank
  const { minRipWidth } = project.rules

  if (project.pins.firstRowRip !== null) {
    return [project.pins.firstRowRip]
  }

  const max = Math.min(coverWidth, height)
  const remainder = (height - max) % coverWidth
  const special = [
    max,
    remainder,
    Math.floor((remainder + coverWidth) / 2),
  ]
  const grid: number[] = []
  for (let rip = max; rip >= minRipWidth; rip -= options.ripStep) {
    grid.push(rip)
  }

  const seen = new Set<number>()

  return [...special, ...grid].filter(rip => {
    if (rip < minRipWidth || rip > max || seen.has(rip)) {
      return false
    }
    seen.add(rip)
    return true
  })
}

/** Height of the last row for a given rip, or null if the room is a single row. */
export function lastRowHeight(height: number, rip: number, coverWidth: number): number | null {

  if (height <= rip) {
    return null
  }

  const rest = (height - rip) % coverWidth

  return rest === 0 ? coverWidth : rest
}
