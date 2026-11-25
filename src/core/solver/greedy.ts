import type { Project } from '../model/types'
import type { Layout, LayoutRow, Piece, PieceSource, Segment } from '../model/layout'
import { pieceShapeProblems, sliceRows } from '../rows/rows'
import type { Band } from '../rows/rows'
import type { Interval } from '../geometry/strips'
import { validate } from '../validate/validate'
import { computeMetrics } from '../report/report'
import { isResult, lastRowHeight, prepare, ripCandidates } from './common'
import type { Prepared } from './common'
import { DEFAULT_SOLVE_OPTIONS } from './types'
import type { RipAttempt, SolveOptions, SolveResult } from './types'

/**
 * Greedy reference solver. For each rip candidate it fills the rows left to right: reuse an
 * offcut when that is legal, otherwise open a new plank, choosing the longest start piece that
 * keeps the joints staggered. Picks the rip with the fewest planks.
 *
 * Kept as a simple baseline: the optimizer must never be worse than this.
 */
export function solveGreedy(project: Project, options: SolveOptions = DEFAULT_SOLVE_OPTIONS): SolveResult {

  const prepared = prepare(project, 'greedy')
  if (isResult(prepared)) {
    return prepared
  }

  const { coverWidth } = project.plank
  const { minRipWidth } = project.rules
  const attempts: RipAttempt[] = []
  let best: Layout | null = null
  let explored = 0

  for (const rip of ripCandidates(project, prepared.height, options)) {
    const last = lastRowHeight(prepared.height, rip, coverWidth)
    if (rip < minRipWidth || rip > coverWidth || (last !== null && last < minRipWidth)) {
      attempts.push({ rip, outcome: 'skipped', reason: last !== null && last < minRipWidth ? `last row would be ${last} mm` : 'rip out of range' })
      continue
    }

    const filled = fill(project, prepared, rip, options)
    explored += filled.explored
    if ('reason' in filled) {
      attempts.push({ rip, outcome: 'failed', reason: filled.reason })
      continue
    }

    const errors = validate(project, filled.layout).filter(v => v.severity === 'error')
    if (errors.length > 0) {
      attempts.push({ rip, outcome: 'failed', reason: `validator: ${errors[0]!.detail}` })
      continue
    }

    attempts.push({ rip, outcome: 'ok', planks: filled.layout.planks })
    if (best === null || filled.layout.planks < best.planks) {
      best = filled.layout
    }
  }

  if (best === null) {
    return {
      status: 'infeasible',
      violations: infeasibleReasons(prepared, minRipWidth, attempts),
      explored,
      debug: { solver: 'greedy', rips: attempts },
    }
  }

  const violations = validate(project, best)

  return {
    status: 'ok',
    layout: best,
    metrics: computeMetrics(project, best, prepared.layableArea),
    violations,
    explored,
    debug: { solver: 'greedy', rips: attempts },
  }
}

function infeasibleReasons(prepared: Prepared, minRipWidth: number, attempts: RipAttempt[]) {

  if (prepared.height < minRipWidth) {
    return [{ rule: 'infeasible', severity: 'error' as const, detail: `The room is only ${prepared.height} mm across the rows, narrower than the minimum rip ${minRipWidth} mm` }]
  }

  const reasons = [...new Set(attempts.filter(a => a.reason).map(a => a.reason!))].slice(0, 5)

  return [{
    rule: 'infeasible',
    severity: 'error' as const,
    detail: `No first-row rip gave a valid layout. ${reasons.join('; ')}`,
  }]
}

/** An unused part of an opened plank. */
type Offcut = PieceSource

interface State {
  planks: number
  offcuts: Offcut[]
  explored: number
}

type FillResult = { layout: Layout, explored: number } | { reason: string, explored: number }

function fill(project: Project, prepared: Prepared, rip: number, options: SolveOptions): FillResult {

  const bands = sliceRows(prepared.region, rip, project.plank.coverWidth)
  const state: State = { planks: 0, offcuts: [], explored: 0 }
  const rows: LayoutRow[] = []
  const jointsByRow: number[][] = []

  for (const band of bands) {
    const neighbours = neighbourJoints(project, jointsByRow, band.index)
    const segments: Segment[] = []
    const rowJoints: number[] = []

    for (let s = 0; s < band.segments.length; s++) {
      const interval = band.segments[s]!
      const pinned = s === 0 ? project.pins.rowStartLengths[String(band.index)] : undefined
      const placed = placeSegment(project, state, band, interval, neighbours, pinned, options)
      if (typeof placed === 'string') {
        return { reason: `row ${band.index}: ${placed}`, explored: state.explored }
      }

      const pieces = placed.map((src, k): Piece => ({ id: `${band.index}-${s}-${k}`, ...src }))
      segments.push({ x0: interval.x0, x1: interval.x1, pieces })
      rowJoints.push(...pieces.slice(0, -1).map(p => p.x1))
    }

    rows.push({ index: band.index, y0: band.y0, y1: band.y1, segments })
    jointsByRow.push(rowJoints)
  }

  return { layout: { frame: prepared.frame, rip, rows, planks: state.planks }, explored: state.explored }
}

/** Joints this row must keep clear of, with the minimum distance for each. */
function neighbourJoints(project: Project, jointsByRow: number[][], row: number): { x: number, min: number }[] {

  const { minJointOffset, minJointOffsetSecondRow } = project.rules
  const out = (jointsByRow[row - 1] ?? []).map(x => ({ x, min: minJointOffset }))
  if (minJointOffsetSecondRow > 0) {
    out.push(...(jointsByRow[row - 2] ?? []).map(x => ({ x, min: minJointOffsetSecondRow })))
  }

  return out
}

interface Placed {
  x0: number
  x1: number
  source: PieceSource
}

/** Fills one segment. Returns the pieces, or a reason it can't be filled. */
function placeSegment(
  project: Project,
  state: State,
  band: Band,
  interval: Interval,
  neighbours: { x: number, min: number }[],
  pinned: number | undefined,
  options: SolveOptions,
): Placed[] | string {

  const { length: P } = project.plank
  const { minPieceLength, minRipWidth } = project.rules
  const L = interval.x1 - interval.x0

  if (L < minPieceLength) {
    return `segment at x=${interval.x0} is ${L} mm, shorter than the minimum piece ${minPieceLength} mm`
  }

  const shapeOk = (x0: number, x1: number) => pieceShapeProblems(band, x0, x1, minRipWidth).length === 0

  if (L <= P && (pinned === undefined || pinned === L)) {
    if (!shapeOk(interval.x0, interval.x1)) {
      return `the single piece at x=${interval.x0} has material that is too narrow or split`
    }
    state.explored++
    return [{ x0: interval.x0, x1: interval.x1, source: takeSingle(project, state, L) }]
  }

  for (const start of startCandidates(project, state, L, pinned, options)) {
    state.explored++
    const lengths = splitSegment(start.length, L, P)
    if (lengths === null || lengths.some(len => len < minPieceLength)) {
      continue
    }

    const joints: number[] = []
    let x = interval.x0
    for (const len of lengths.slice(0, -1)) {
      x += len
      joints.push(x)
    }
    if (joints.some(j => neighbours.some(n => Math.abs(j - n.x) < n.min))) {
      continue
    }

    const edges = [interval.x0, ...joints, interval.x1]
    if (!lengths.every((_, k) => shapeOk(edges[k]!, edges[k + 1]!))) {
      continue
    }

    return lengths.map((len, k) => ({
      x0: edges[k]!,
      x1: edges[k + 1]!,
      source: k === 0
        ? takeStart(project, state, start)
        : k < lengths.length - 1 || len === P
          ? openFull(state, P)
          : takeEnd(project, state, len),
    }))
  }

  return `no start length at x=${interval.x0} keeps the joints staggered and the pieces valid`
}

/** Piece lengths for a segment of length L starting with `s`: s, full planks, then the rest. */
function splitSegment(s: number, L: number, P: number): number[] | null {

  if (s > L || s > P) {
    return null
  }

  const out = [s]
  let rest = L - s
  while (rest > P) {
    out.push(P)
    rest -= P
  }
  if (rest > 0) {
    out.push(rest)
  }

  return out
}

interface StartCandidate {
  length: number
  /** The R offcut to use, or null to open a new plank. */
  offcut: Offcut | null
}

/** R offcuts first (longest first), then new-plank starts from P downwards. */
function startCandidates(project: Project, state: State, L: number, pinned: number | undefined, options: SolveOptions): StartCandidate[] {

  const P = project.plank.length
  const rOffcuts = state.offcuts
    .filter(o => o.to === P && o.from > 0)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.plank - b.plank)

  if (pinned !== undefined) {
    const exact = rOffcuts.find(o => o.to - o.from === pinned) ?? null
    return [{ length: pinned, offcut: exact }]
  }

  const out: StartCandidate[] = rOffcuts.filter(o => o.to - o.from <= L).map(o => ({ length: o.to - o.from, offcut: o }))
  for (let s = Math.min(P, L); s >= project.rules.minPieceLength; s -= options.startLengthStep) {
    out.push({ length: s, offcut: null })
  }

  return out
}

function takeStart(project: Project, state: State, start: StartCandidate): PieceSource {

  const P = project.plank.length
  if (start.offcut) {
    removeOffcut(state, start.offcut)
    return { ...start.offcut }
  }

  const plank = state.planks++
  keepOffcut(project, state, { plank, from: 0, to: P - start.length - project.plank.kerf })

  return { plank, from: P - start.length, to: P }
}

function openFull(state: State, P: number): PieceSource {

  return { plank: state.planks++, from: 0, to: P }
}

/** The last piece of a segment: needs an L end. Uses the shortest L offcut that is long enough. */
function takeEnd(project: Project, state: State, len: number): PieceSource {

  const { length: P, kerf } = project.plank
  const offcut = state.offcuts
    .filter(o => o.from === 0 && o.to < P && o.to >= len)
    .sort((a, b) => a.to - b.to || a.plank - b.plank)[0]

  if (offcut) {
    removeOffcut(state, offcut)
    keepOffcut(project, state, { plank: offcut.plank, from: len + kerf, to: offcut.to })
    return { plank: offcut.plank, from: 0, to: len }
  }

  const plank = state.planks++
  keepOffcut(project, state, { plank, from: len + kerf, to: P })

  return { plank, from: 0, to: len }
}

/** A single piece filling a whole segment: any kind is fine. Uses the shortest offcut that fits. */
function takeSingle(project: Project, state: State, len: number): PieceSource {

  const { length: P, kerf } = project.plank
  if (len === P) {
    return openFull(state, P)
  }

  const offcut = state.offcuts
    .filter(o => o.to - o.from >= len)
    .sort((a, b) => (a.to - a.from) - (b.to - b.from) || a.plank - b.plank)[0]

  if (offcut) {
    removeOffcut(state, offcut)
    if (offcut.to === P) {
      keepOffcut(project, state, { plank: offcut.plank, from: offcut.from, to: offcut.to - len - kerf })
      return { plank: offcut.plank, from: offcut.to - len, to: offcut.to }
    }
    keepOffcut(project, state, { plank: offcut.plank, from: offcut.from + len + kerf, to: offcut.to })
    return { plank: offcut.plank, from: offcut.from, to: offcut.from + len }
  }

  const plank = state.planks++
  keepOffcut(project, state, { plank, from: len + kerf, to: P })

  return { plank, from: 0, to: len }
}

function keepOffcut(project: Project, state: State, offcut: Offcut): void {

  if (offcut.to - offcut.from >= project.rules.minPieceLength) {
    state.offcuts.push(offcut)
  }
}

function removeOffcut(state: State, offcut: Offcut): void {

  state.offcuts = state.offcuts.filter(o => o !== offcut)
}
