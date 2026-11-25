import type { Project, Violation } from '../model/types'
import { components, difference, fromRects, intersect, isEmpty } from '../geometry/region'
import type { Region } from '../geometry/region'
import { grow, opening, shrink } from '../geometry/morph'

export interface LayableResult {
  /** The floor to cover, in world coordinates. */
  region: Region
  /** Errors block the optimizer; warnings don't. Ordered: errors first, then by rule. */
  issues: Violation[]
}

/**
 * layable = shrink(union(adds), wallGap) − union(grow(subtract_i, gap_i)),
 * plus the room validity checks from design spec §4.4.
 */
export function computeLayable(project: Project): LayableResult {

  const { wallGap, shapes } = project.room
  const issues: Violation[] = []

  for (const shape of shapes) {
    if (shape.w <= 0 || shape.h <= 0) {
      issues.push({
        rule: 'invalid-shape',
        severity: 'error',
        shapeId: shape.id,
        detail: `Shape ${shape.label ?? shape.id} has width or height ≤ 0`,
      })
    }
  }

  const valid = shapes.filter(s => s.w > 0 && s.h > 0)
  const adds = fromRects(valid.filter(s => s.op === 'add'))
  const subtracts = valid.filter(s => s.op === 'subtract')

  let blocked: Region = []
  for (const s of subtracts) {
    blocked = fromRects([...blocked, ...grow(fromRects([s]), s.gap ?? wallGap)])
    if (isEmpty(intersect(fromRects([s]), adds))) {
      issues.push({
        rule: 'subtract-outside',
        severity: 'warning',
        shapeId: s.id,
        detail: `Obstacle ${s.label ?? s.id} doesn't overlap the room and has no effect`,
        rects: [{ x: s.x, y: s.y, w: s.w, h: s.h }],
      })
    }
  }

  const region = difference(shrink(adds, wallGap), blocked)

  if (isEmpty(region)) {
    issues.push({ rule: 'empty', severity: 'error', detail: 'There is no floor left to cover' })
    return { region, issues: sortIssues(issues) }
  }

  const parts = components(region)
  if (parts.length > 1) {
    issues.push({
      rule: 'disconnected',
      severity: 'error',
      detail: `The floor falls apart into ${parts.length} separate parts (corner contact doesn't connect)`,
      rects: parts.flat(),
    })
  }

  const minRip = project.rules.minRipWidth
  const narrow = difference(region, opening(region, minRip))
  if (!isEmpty(narrow)) {
    issues.push({
      rule: 'too-narrow',
      severity: 'warning',
      detail: `Some areas are narrower than ${minRip} mm and can't be covered properly`,
      rects: narrow,
    })
  }

  return { region, issues: sortIssues(issues) }
}

function sortIssues(issues: Violation[]): Violation[] {

  const rank = (v: Violation) => (v.severity === 'error' ? 0 : 1)

  return issues.sort((a, b) => rank(a) - rank(b) || a.rule.localeCompare(b.rule))
}
