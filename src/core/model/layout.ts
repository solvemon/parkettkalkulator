import type { Frame } from '../geometry/frame'
import type { Mm } from './types'

/**
 * Where a piece comes from: the interval [from, to) of source plank number `plank`,
 * measured from the plank's L (left) factory end. Pieces are never rotated, so a piece's left
 * end is `from` and its right end is `to`.
 */
export interface PieceSource {
  plank: number
  from: Mm
  to: Mm
}

/** A piece covers [x0, x1) of its segment, in the solver frame. Length = x1 − x0 = to − from. */
export interface Piece {
  id: string
  x0: Mm
  x1: Mm
  source: PieceSource
}

export interface Segment {
  x0: Mm
  x1: Mm
  pieces: Piece[]
}

export interface LayoutRow {
  index: number
  y0: Mm
  y1: Mm
  segments: Segment[]
}

/** A complete layout, in the solver frame (planks along +x, rows along +y). */
export interface Layout {
  frame: Frame
  rip: Mm
  rows: LayoutRow[]
  /** Number of planks opened (source plank ids are 0 … planks − 1). */
  planks: number
}

export type PieceKind = 'full' | 'R' | 'L' | 'C'

/** Derived from which factory ends the piece still has. */
export function pieceKind(source: PieceSource, plankLength: Mm): PieceKind {

  const hasL = source.from === 0
  const hasR = source.to === plankLength

  if (hasL && hasR) {
    return 'full'
  }
  if (hasR) {
    return 'R'
  }
  if (hasL) {
    return 'L'
  }

  return 'C'
}
