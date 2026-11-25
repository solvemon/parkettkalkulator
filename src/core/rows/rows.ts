import type { Rect } from '../model/types'
import { components, fromRects, intersect } from '../geometry/region'
import type { Region } from '../geometry/region'
import { narrowStrips, xIntervals } from '../geometry/strips'
import type { Interval } from '../geometry/strips'

/** One row's strip of the floor, in the solver frame. */
export interface Band {
  index: number
  y0: number
  y1: number
  /** layable ∩ band */
  region: Region
  /** Maximal x-intervals where the band isn't fully blocked. Cut ends may only sit at their ends. */
  segments: Interval[]
}

export type ShapeProblem =
  | { kind: 'split', detail: string, rects: Rect[] }
  | { kind: 'narrow', detail: string, rects: Rect[] }

/**
 * Row boundaries from `y0` to `y1`: row 0 is `rip` wide, the rest `coverWidth`, the last row
 * whatever remains. A room narrower than `rip` is a single row.
 */
export function rowBoundaries(y0: number, y1: number, rip: number, coverWidth: number): number[] {

  const out = [y0]
  let y = y0 + rip
  while (y < y1) {
    out.push(y)
    y += coverWidth
  }
  out.push(y1)

  return out
}

/** Slices a solver-frame region into bands for the given first-row rip. */
export function sliceRows(region: Region, rip: number, coverWidth: number): Band[] {

  if (region.length === 0) {
    return []
  }

  const y0 = Math.min(...region.map(r => r.y))
  const y1 = Math.max(...region.map(r => r.y + r.h))
  const xMin = Math.min(...region.map(r => r.x))
  const xMax = Math.max(...region.map(r => r.x + r.w))
  const bounds = rowBoundaries(y0, y1, rip, coverWidth)

  const bands: Band[] = []
  for (let i = 0; i + 1 < bounds.length; i++) {
    const top = bounds[i]!
    const bottom = bounds[i + 1]!
    const bandRegion = intersect(region, fromRects([{ x: xMin, y: top, w: xMax - xMin, h: bottom - top }]))
    bands.push({ index: i, y0: top, y1: bottom, region: bandRegion, segments: xIntervals(bandRegion) })
  }

  return bands
}

/** The shape of a piece covering [x0, x1) of a band: layable ∩ band ∩ [x0, x1). */
export function pieceShape(band: Band, x0: number, x1: number): Region {

  return intersect(band.region, fromRects([{ x: x0, y: band.y0, w: x1 - x0, h: band.y1 - band.y0 }]))
}

/**
 * Problems with the material of a piece covering [x0, x1): it must be one connected part, and
 * every strip of material across it must be at least `minRipWidth` wide.
 */
export function pieceShapeProblems(band: Band, x0: number, x1: number, minRipWidth: number): ShapeProblem[] {

  const shape = pieceShape(band, x0, x1)
  const problems: ShapeProblem[] = []

  const parts = components(shape)
  if (parts.length > 1) {
    problems.push({ kind: 'split', detail: `piece falls apart into ${parts.length} parts`, rects: shape })
  }

  const narrow = narrowStrips(shape, minRipWidth)
  if (narrow.length > 0) {
    problems.push({ kind: 'narrow', detail: `material narrower than ${minRipWidth} mm`, rects: narrow })
  }

  return problems
}
