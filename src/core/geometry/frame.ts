import type { LayoutSettings, Rect } from '../model/types'
import { fromRects } from './region'
import type { Region } from './region'

/**
 * Maps world coordinates to the solver frame, where planks run along +x, rows stack along +y,
 * and the start corner is at the top-left (min x, min y).
 *
 * World → solver: first swap x/y (if `swap`), then negate x and/or y (if `mirrorX`/`mirrorY`).
 * Negation keeps everything integer, and no bounding box is needed.
 */
export interface Frame {
  swap: boolean
  mirrorX: boolean
  mirrorY: boolean
}

export function frameFor(layout: LayoutSettings): Frame {

  const top = layout.startCorner.startsWith('top')
  const left = layout.startCorner.endsWith('left')

  if (layout.direction === 'x') {
    // Pieces go along world x (left→right unless starting right); rows go along world y.
    return { swap: false, mirrorX: !left, mirrorY: !top }
  }

  // Planks run along world y: solver x = world y (laying top→bottom unless starting at the
  // bottom), solver y = world x (rows from the left wall unless starting right).
  return { swap: true, mirrorX: !top, mirrorY: !left }
}

export function rectToSolver(frame: Frame, r: Rect): Rect {

  let out = frame.swap ? { x: r.y, y: r.x, w: r.h, h: r.w } : { ...r }
  if (frame.mirrorX) {
    out = { ...out, x: 0 - (out.x + out.w) }
  }
  if (frame.mirrorY) {
    out = { ...out, y: 0 - (out.y + out.h) }
  }

  return out
}

export function rectToWorld(frame: Frame, r: Rect): Rect {

  let out = { ...r }
  if (frame.mirrorX) {
    out = { ...out, x: 0 - (out.x + out.w) }
  }
  if (frame.mirrorY) {
    out = { ...out, y: 0 - (out.y + out.h) }
  }

  return frame.swap ? { x: out.y, y: out.x, w: out.h, h: out.w } : out
}

export function regionToSolver(frame: Frame, region: Region): Region {

  return fromRects(region.map(r => rectToSolver(frame, r)))
}

export function regionToWorld(frame: Frame, region: Region): Region {

  return fromRects(region.map(r => rectToWorld(frame, r)))
}
