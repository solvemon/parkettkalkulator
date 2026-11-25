/** Integer millimetres. */
export type Mm = number

/** Axis-aligned rectangle, half-open: covers [x, x + w) × [y, y + h). */
export interface Rect {
  x: Mm
  y: Mm
  w: Mm
  h: Mm
}

export type ShapeOp = 'add' | 'subtract'

export interface Shape extends Rect {
  id: string
  op: ShapeOp
  label?: string
  /** Expansion gap around a subtract shape. Missing means it inherits `room.wallGap`. */
  gap?: Mm
}

export interface Room {
  wallGap: Mm
  shapes: Shape[]
}

export interface Plank {
  length: Mm
  width: Mm
  /** Visible width once laid. The solver uses this. */
  coverWidth: Mm
  kerf: Mm
  planksPerPack: number
}

export type Direction = 'x' | 'y'
export type StartCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface LayoutSettings {
  direction: Direction
  startCorner: StartCorner
}

export interface Rules {
  minJointOffset: Mm
  /** 0 turns the rule off. */
  minJointOffsetSecondRow: Mm
  minPieceLength: Mm
  minRipWidth: Mm
}

export interface Pins {
  firstRowRip: Mm | null
  /** Row index (as a string key, for JSON) → length of that row's first piece. */
  rowStartLengths: Record<string, Mm>
}

export const CURRENT_VERSION = 1

export interface Project {
  version: typeof CURRENT_VERSION
  id: string
  name: string
  room: Room
  plank: Plank
  layout: LayoutSettings
  rules: Rules
  pins: Pins
}

export type Severity = 'error' | 'warning'

/** A rule problem reported as data, never thrown. */
export interface Violation {
  rule: string
  severity: Severity
  detail: string
  shapeId?: string
  row?: number
  x?: Mm
  y?: Mm
  /** Areas to highlight in the UI, in world coordinates. */
  rects?: Rect[]
}
