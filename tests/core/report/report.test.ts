import { describe, expect, it } from 'vitest'
import { computeMetrics, cutList, layingOrder } from '../../../src/core/report/report'
import { CW, P, layout, r, row, run, seg, testProject } from '../builders'

const project = testProject(r(0, 0, 3000, 2 * CW))
// Row 0: full plank 0 + L-piece 587 from plank 1 (leaves an R offcut of 1823).
// Row 1: that R offcut (1823) + L-piece 1177 from plank 2.
const lay = layout(project, CW, [
  row(0, 0, CW, [seg(0, [[0, 0, P], [1, 0, 587]])]),
  row(1, CW, 2 * CW, [seg(0, [[1, 590, P], [2, 0, 1177]], 1)]),
])
const area = 3000 * 2 * CW

describe('report', () => {
  it('RPT-001: waste % is based on the layable area', () => {
    const m = computeMetrics(project, lay, area)
    const bought = 3 * P * CW

    expect(m.wastePercent).toBeCloseTo(((bought - area) / bought) * 100, 10)
    expect(m.lowerBound).toBe(3)
    expect(m.gap).toBe(0)
  })

  it('RPT-002: packs = ceil(planks / planksPerPack), with an optional spare %', () => {
    const big = layout(project, CW, [row(0, 0, CW, [seg(0, run(7 * P, P, 0))])])

    expect(computeMetrics(project, big, area).packs).toBe(2)
    expect(computeMetrics(project, big, area, { sparePercent: 0 }).packsWithSpare).toBe(2)
    expect(computeMetrics(project, lay, area, { sparePercent: 100 }).packsWithSpare).toBe(1)
    expect(computeMetrics(project, big, area, { sparePercent: 50 }).packsWithSpare).toBe(2)
  })

  it('RPT-003: every opened plank is fully accounted for by pieces, kerf and waste', () => {
    const list = cutList(project, lay)

    expect(list).toHaveLength(3)
    for (const plank of list) {
      expect(plank.parts[0]?.from).toBe(0)
      expect(plank.parts[plank.parts.length - 1]?.to).toBe(P)
      plank.parts.forEach((part, i) => {
        if (i > 0) {
          expect(part.from).toBe(plank.parts[i - 1]!.to)
        }
      })
    }
    expect(list[1]!.parts.map(p => [p.kind, p.to - p.from])).toEqual([['piece', 587], ['kerf', 3], ['piece', 1823]])
    expect(list[2]!.parts.map(p => [p.kind, p.to - p.from])).toEqual([['piece', 1177], ['kerf', 3], ['waste', 1233]])
  })

  it('counts cuts as kerfs', () => {
    expect(computeMetrics(project, lay, area).cuts).toBe(2)
  })

  it('RPT-004: laying order is row by row from the start, left to right', () => {
    const order = layingOrder(project, lay)

    expect(order.map(p => [p.order, p.row, p.plank, p.length, p.kind])).toEqual([
      [1, 0, 0, P, 'full'],
      [2, 0, 1, 587, 'L'],
      [3, 1, 1, 1823, 'R'],
      [4, 1, 2, 1177, 'L'],
    ])
  })

  it('counts ripped rows', () => {
    const ripped = layout(project, 100, [row(0, 0, 100, [seg(0, [[0, 0, P]])])])

    expect(computeMetrics(project, ripped, area).rippedRows).toBe(1)
  })
})
