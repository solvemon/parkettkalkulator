import type { Project, Rect, Violation } from '../model/types'
import type { Layout, LayoutRow, Piece } from '../model/layout'
import { computeLayable } from '../layable/layable'
import { frameFor, rectToWorld } from '../geometry/frame'
import type { Frame } from '../geometry/frame'
import { regionToSolver } from '../geometry/frame'
import { components, fromRects, intersect } from '../geometry/region'
import type { Region } from '../geometry/region'
import { intersectIntervals, mergeIntervals, narrowStrips, xIntervals } from '../geometry/strips'
import type { Interval } from '../geometry/strips'

/**
 * Checks a complete layout against every rule in design spec §5.4.
 *
 * Independent of the solver: it shares only types and geometry primitives, so it can act as the
 * oracle for solver tests. Problems are returned as data; it never throws.
 * Highlight rects are in world coordinates.
 */
export function validate(project: Project, layout: Layout): Violation[] {

  const layable = computeLayable(project)
  const roomErrors = layable.issues.filter(i => i.severity === 'error')
  if (roomErrors.length > 0) {
    return roomErrors
  }

  const frame = frameFor(project.layout)
  if (!sameFrame(frame, layout.frame)) {
    return [{ rule: 'frame', severity: 'error', detail: 'Layout frame does not match the project layout settings' }]
  }

  const ctx: Ctx = { project, layout, frame, region: regionToSolver(frame, layable.region), out: [] }

  if (!checkRows(ctx)) {
    return ctx.out
  }

  for (const row of layout.rows) {
    checkRow(ctx, row)
  }
  checkMaterial(ctx)
  checkStagger(ctx)
  checkPins(ctx)

  return ctx.out
}

interface Ctx {
  project: Project
  layout: Layout
  frame: Frame
  /** Layable region in the solver frame. */
  region: Region
  out: Violation[]
}

function report(ctx: Ctx, rule: string, detail: string, extra: { row?: number, rects?: Rect[], severity?: 'error' | 'warning' } = {}): void {

  const violation: Violation = { rule, severity: extra.severity ?? 'error', detail }
  if (extra.row !== undefined) {
    violation.row = extra.row
  }
  if (extra.rects) {
    violation.rects = extra.rects.map(r => rectToWorld(ctx.frame, r))
  }

  ctx.out.push(violation)
}

/** Row bands must tile the region's y-extent: rip, then coverWidth, then the remainder. */
function checkRows(ctx: Ctx): boolean {

  const { layout, region } = ctx
  const { coverWidth } = ctx.project.plank
  const y0 = Math.min(...region.map(r => r.y))
  const y1 = Math.max(...region.map(r => r.y + r.h))
  const rows = layout.rows

  if (layout.rip < 1 || layout.rip > coverWidth) {
    report(ctx, 'rows', `First-row rip ${layout.rip} is outside 1…${coverWidth} mm`)
    return false
  }
  if (rows.length === 0 || rows[0]!.y0 !== y0 || rows[rows.length - 1]!.y1 !== y1) {
    report(ctx, 'rows', `Rows must cover the floor from y=${y0} to y=${y1}`)
    return false
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const height = row.y1 - row.y0
    const isFirst = i === 0
    const isLast = i === rows.length - 1
    const contiguous = isFirst || row.y0 === rows[i - 1]!.y1
    const expected = isFirst ? Math.min(layout.rip, y1 - y0) : coverWidth
    const heightOk = isLast && !isFirst ? height > 0 && height <= coverWidth : height === expected

    if (row.index !== i || !contiguous || !heightOk) {
      report(ctx, 'rows', `Row ${i} spans ${row.y0}…${row.y1}, which doesn't fit the row stacking`, { row: i })
      return false
    }
  }

  return true
}

function checkRow(ctx: Ctx, row: LayoutRow): void {

  const { plank, rules } = ctx.project
  const band = bandRegion(ctx.region, row)
  const expected = xIntervals(band)
  const actual = row.segments.map(s => ({ x0: s.x0, x1: s.x1 }))

  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    report(ctx, 'coverage', `Row ${row.index}: segments ${fmt(actual)} should be ${fmt(expected)}`, {
      row: row.index,
      rects: expected.map(i => ({ x: i.x0, y: row.y0, w: i.x1 - i.x0, h: row.y1 - row.y0 })),
    })
  }

  for (const seg of row.segments) {
    const pieces = seg.pieces
    let x = seg.x0

    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]!
      const length = p.x1 - p.x0
      const rect = { x: p.x0, y: row.y0, w: Math.max(length, 1), h: row.y1 - row.y0 }

      if (p.x0 !== x || length <= 0) {
        report(ctx, 'coverage', `Piece ${p.id} starts at ${p.x0}, expected ${x}`, { row: row.index, rects: [rect] })
      }
      x = p.x1

      if (p.source.to - p.source.from !== length) {
        report(ctx, 'material', `Piece ${p.id} is ${length} mm but its source is ${p.source.to - p.source.from} mm`, { row: row.index, rects: [rect] })
      }

      if (length < rules.minPieceLength) {
        report(ctx, 'min-piece-length', `Piece ${p.id} is ${length} mm, shorter than ${rules.minPieceLength} mm`, { row: row.index, rects: [rect] })
      }

      const endProblem = endTypeProblem(p, k, pieces.length, plank.length)
      if (endProblem) {
        report(ctx, 'end-type', `Piece ${p.id}: ${endProblem}`, { row: row.index, rects: [rect] })
      }

      checkPieceMaterial(ctx, row, band, p)
    }

    if (pieces.length === 0 || x !== seg.x1) {
      report(ctx, 'coverage', `Row ${row.index}: pieces end at ${x}, segment ends at ${seg.x1}`, {
        row: row.index,
        rects: [{ x: Math.min(x, seg.x1), y: row.y0, w: Math.max(Math.abs(seg.x1 - x), 1), h: row.y1 - row.y0 }],
      })
    }
  }
}

/** Factory ends must meet factory ends; cut ends only at segment ends. */
function endTypeProblem(p: Piece, k: number, count: number, plankLength: number): string | null {

  const hasL = p.source.from === 0
  const hasR = p.source.to === plankLength
  const needsL = k > 0
  const needsR = k < count - 1

  if (needsL && !hasL) {
    return 'its left end is cut but it joins the previous piece (needs a factory L end)'
  }
  if (needsR && !hasR) {
    return 'its right end is cut but the next piece joins it (needs a factory R end)'
  }

  return null
}

function checkPieceMaterial(ctx: Ctx, row: LayoutRow, band: Region, p: Piece): void {

  if (p.x1 <= p.x0) {
    return
  }

  const shape = intersect(band, fromRects([{ x: p.x0, y: row.y0, w: p.x1 - p.x0, h: row.y1 - row.y0 }]))
  const parts = components(shape)
  if (parts.length > 1) {
    report(ctx, 'min-width', `Piece ${p.id} falls apart into ${parts.length} separate parts`, { row: row.index, rects: shape })
  }

  const minRip = ctx.project.rules.minRipWidth
  const narrow = narrowStrips(shape, minRip)
  if (narrow.length > 0) {
    report(ctx, 'min-width', `Piece ${p.id} has material narrower than ${minRip} mm`, { row: row.index, rects: narrow })
  }
}

/** Every piece comes from a real plank; pieces of a plank don't overlap and leave room for the kerf. */
function checkMaterial(ctx: Ctx): void {

  const { length, kerf } = ctx.project.plank
  const byPlank = new Map<number, Piece[]>()

  for (const row of ctx.layout.rows) {
    for (const seg of row.segments) {
      for (const p of seg.pieces) {
        const { plank, from, to } = p.source
        if (!Number.isInteger(plank) || plank < 0 || plank >= ctx.layout.planks || from < 0 || to > length || to <= from) {
          report(ctx, 'material', `Piece ${p.id} has an impossible source: plank ${plank} [${from}, ${to})`)
          continue
        }
        byPlank.set(plank, [...(byPlank.get(plank) ?? []), p])
      }
    }
  }

  for (const [plank, pieces] of [...byPlank.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...pieces].sort((a, b) => a.source.from - b.source.from)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const next = sorted[i]!
      const gap = next.source.from - prev.source.to
      if (gap < kerf) {
        const what = gap < 0 ? 'overlap' : `leave only ${gap} mm for a ${kerf} mm kerf`
        report(ctx, 'material', `Plank ${plank}: pieces ${prev.id} and ${next.id} ${what}`)
      }
    }
  }
}

/** Joints (piece boundaries inside a segment) per row. Segment ends are not joints. */
function joints(row: LayoutRow): number[] {

  return row.segments.flatMap(s => s.pieces.slice(0, -1).map(p => p.x1))
}

/** Where the line between two rows at y = boundary has material on both sides. */
function contact(region: Region, boundary: number): Interval[] {

  const above = mergeIntervals(region.filter(r => r.y < boundary && boundary <= r.y + r.h).map(r => ({ x0: r.x, x1: r.x + r.w })))
  const below = mergeIntervals(region.filter(r => r.y <= boundary && boundary < r.y + r.h).map(r => ({ x0: r.x, x1: r.x + r.w })))

  return intersectIntervals(above, below)
}

function checkStagger(ctx: Ctx): void {

  const { rows } = ctx.layout
  const { minJointOffset, minJointOffsetSecondRow } = ctx.project.rules
  const contacts = rows.slice(1).map(row => contact(ctx.region, row.y0))

  for (let k = 0; k + 1 < rows.length; k++) {
    compareJoints(ctx, rows[k]!, rows[k + 1]!, contacts[k]!, minJointOffset, 'stagger')
  }

  if (minJointOffsetSecondRow > 0) {
    for (let k = 0; k + 2 < rows.length; k++) {
      const both = intersectIntervals(contacts[k]!, contacts[k + 1]!)
      compareJoints(ctx, rows[k]!, rows[k + 2]!, both, minJointOffsetSecondRow, 'stagger-second-row')
    }
  }
}

/**
 * Joints are compared only where the rows between them touch along an unbroken line of material
 * over the whole span between the two joints (provisional rule, see the plan). Inclusive bound.
 */
function compareJoints(ctx: Ctx, a: LayoutRow, b: LayoutRow, touching: Interval[], min: number, rule: string): void {

  for (const ja of joints(a)) {
    for (const jb of joints(b)) {
      const lo = Math.min(ja, jb)
      const hi = Math.max(ja, jb)
      if (hi - lo >= min || !touching.some(c => c.x0 <= lo && hi <= c.x1)) {
        continue
      }
      report(ctx, rule, `Rows ${a.index} and ${b.index}: joints at ${ja} and ${jb} are ${hi - lo} mm apart (min ${min})`, {
        row: b.index,
        rects: [{ x: lo, y: a.y0, w: Math.max(hi - lo, 1), h: b.y1 - a.y0 }],
      })
    }
  }
}

function checkPins(ctx: Ctx): void {

  const { pins } = ctx.project
  const { layout } = ctx

  if (pins.firstRowRip !== null && pins.firstRowRip !== layout.rip) {
    report(ctx, 'pin', `First-row rip is ${layout.rip} mm but is pinned to ${pins.firstRowRip} mm`, { row: 0 })
  }

  for (const [key, length] of Object.entries(pins.rowStartLengths)) {
    const index = Number(key)
    const row = layout.rows[index]
    if (!row) {
      report(ctx, 'pin-ignored', `Row ${index} doesn't exist; its pinned start length is ignored`, { severity: 'warning' })
      continue
    }
    const first = row.segments[0]?.pieces[0]
    const actual = first ? first.x1 - first.x0 : 0
    if (actual !== length) {
      report(ctx, 'pin', `Row ${index} starts with a ${actual} mm piece but is pinned to ${length} mm`, { row: index })
    }
  }
}

function bandRegion(region: Region, row: LayoutRow): Region {

  const x0 = Math.min(...region.map(r => r.x))
  const x1 = Math.max(...region.map(r => r.x + r.w))

  return intersect(region, fromRects([{ x: x0, y: row.y0, w: x1 - x0, h: row.y1 - row.y0 }]))
}

function sameFrame(a: Frame, b: Frame): boolean {

  return a.swap === b.swap && a.mirrorX === b.mirrorX && a.mirrorY === b.mirrorY
}

function fmt(intervals: Interval[]): string {

  return intervals.map(i => `[${i.x0}, ${i.x1})`).join(' ') || 'none'
}
