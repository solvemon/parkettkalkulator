import type { LayoutSettings, Pins, Plank, Rules } from './types'

export const DEFAULT_PLANK: Plank = {
  length: 2413,
  width: 232,
  coverWidth: 228,
  kerf: 3,
  planksPerPack: 6,
}

export const DEFAULT_RULES: Rules = {
  minJointOffset: 500,
  minJointOffsetSecondRow: 0,
  minPieceLength: 300,
  minRipWidth: 50,
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  direction: 'x',
  startCorner: 'top-left',
}

export const DEFAULT_WALL_GAP = 10

export function defaultPins(): Pins {

  return { firstRowRip: null, rowStartLengths: {} }
}
