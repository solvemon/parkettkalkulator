import type { Project } from '../model/types'
import type { Layout, Piece, PieceKind } from '../model/layout'
import { pieceKind } from '../model/layout'

export interface Metrics {
  planks: number
  packs: number
  /** Floor to cover, mm² (gap bands excluded). */
  layableArea: number
  /** length × coverWidth, mm². */
  plankArea: number
  /** (planks × plankArea − layableArea) / (planks × plankArea), as a percentage. */
  wastePercent: number
  /** ceil(layableArea / plankArea). No layout can use fewer planks. */
  lowerBound: number
  /** planks − lowerBound. */
  gap: number
  /** Crosscuts (one kerf each). */
  cuts: number
  /** Rows narrower than coverWidth (ripped lengthwise). */
  rippedRows: number
  sparePercent: number
  packsWithSpare: number
}

export interface CutPart {
  kind: 'piece' | 'kerf' | 'waste'
  from: number
  to: number
  pieceId?: string
  pieceKind?: PieceKind
}

export interface PlankCuts {
  plank: number
  /** Covers [0, length) of the plank exactly, in order. */
  parts: CutPart[]
}

export interface LaidPiece {
  order: number
  pieceId: string
  row: number
  plank: number
  length: number
  kind: PieceKind
}

export interface Report {
  metrics: Metrics
  cutList: PlankCuts[]
  layingOrder: LaidPiece[]
}

export interface ReportOptions {
  sparePercent?: number
}

export function computeMetrics(project: Project, layout: Layout, layableArea: number, options: ReportOptions = {}): Metrics {

  const { length, coverWidth, planksPerPack } = project.plank
  const plankArea = length * coverWidth
  const planks = layout.planks
  const bought = planks * plankArea
  const lowerBound = Math.ceil(layableArea / plankArea)

  const sparePercent = options.sparePercent ?? 0
  const planksWithSpare = Math.ceil(planks * (1 + sparePercent / 100))

  return {
    planks,
    packs: Math.ceil(planks / planksPerPack),
    layableArea,
    plankArea,
    wastePercent: bought === 0 ? 0 : ((bought - layableArea) / bought) * 100,
    lowerBound,
    gap: planks - lowerBound,
    cuts: cutList(project, layout).reduce((sum, p) => sum + p.parts.filter(q => q.kind === 'kerf').length, 0),
    rippedRows: layout.rows.filter(r => r.y1 - r.y0 < coverWidth).length,
    sparePercent,
    packsWithSpare: Math.ceil(planksWithSpare / planksPerPack),
  }
}

export function report(project: Project, layout: Layout, layableArea: number, options: ReportOptions = {}): Report {

  return {
    metrics: computeMetrics(project, layout, layableArea, options),
    cutList: cutList(project, layout),
    layingOrder: layingOrder(project, layout),
  }
}

/** Pieces in laying order: row by row from the start wall, left to right within a row. */
export function layingOrder(project: Project, layout: Layout): LaidPiece[] {

  const out: LaidPiece[] = []
  for (const row of layout.rows) {
    for (const seg of row.segments) {
      for (const p of seg.pieces) {
        out.push({
          order: out.length + 1,
          pieceId: p.id,
          row: row.index,
          plank: p.source.plank,
          length: p.x1 - p.x0,
          kind: pieceKind(p.source, project.plank.length),
        })
      }
    }
  }

  return out
}

/** For every opened plank: its pieces, kerfs and waste, covering the whole plank length. */
export function cutList(project: Project, layout: Layout): PlankCuts[] {

  const { length, kerf } = project.plank
  const byPlank = new Map<number, Piece[]>()
  for (let i = 0; i < layout.planks; i++) {
    byPlank.set(i, [])
  }
  for (const row of layout.rows) {
    for (const seg of row.segments) {
      for (const p of seg.pieces) {
        byPlank.get(p.source.plank)?.push(p)
      }
    }
  }

  return [...byPlank.entries()].map(([plank, pieces]) => {

    const sorted = [...pieces].sort((a, b) => a.source.from - b.source.from)
    const parts: CutPart[] = []
    let pos = 0

    sorted.forEach((p, i) => {
      const gap = p.source.from - pos
      if (gap > 0) {
        const afterPrevious = i === 0 ? 0 : Math.min(kerf, gap)
        const beforeThis = Math.min(kerf, gap - afterPrevious)
        push(parts, 'kerf', pos, pos + afterPrevious)
        push(parts, 'waste', pos + afterPrevious, p.source.from - beforeThis)
        push(parts, 'kerf', p.source.from - beforeThis, p.source.from)
      }
      parts.push({ kind: 'piece', from: p.source.from, to: p.source.to, pieceId: p.id, pieceKind: pieceKind(p.source, length) })
      pos = p.source.to
    })

    if (pos < length) {
      const k = sorted.length === 0 ? 0 : Math.min(kerf, length - pos)
      push(parts, 'kerf', pos, pos + k)
      push(parts, 'waste', pos + k, length)
    }

    return { plank, parts }
  })
}

function push(parts: CutPart[], kind: 'kerf' | 'waste', from: number, to: number): void {

  if (to > from) {
    parts.push({ kind, from, to })
  }
}
