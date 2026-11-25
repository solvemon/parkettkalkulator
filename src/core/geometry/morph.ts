import { bbox, difference, fromRects } from './region'
import type { Region } from './region'

/**
 * Grow (dilate) by g mm with a square structuring element. Dilation distributes over union,
 * so growing each rect and taking the union is exact.
 */
export function grow(region: Region, g: number): Region {

  if (g === 0) {
    return region
  }

  return fromRects(region.map(r => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g })))
}

/**
 * Morphological opening with a size × size square: the union of every size × size square that
 * fits inside the region. Whatever is left over is too narrow to fit such a square.
 */
export function opening(region: Region, size: number): Region {

  const box = bbox(region)
  if (size <= 1 || box === null) {
    return region
  }

  const d = size - 1
  const outer = fromRects([{ x: box.x - size, y: box.y - size, w: box.w + 2 * size, h: box.h + 2 * size }])
  const complement = difference(outer, region)

  // Erode by the anchored square [0, size)²: keep p only if p + [0, d]² is inside the region.
  const eroded = difference(region, fromRects(complement.map(r => ({ x: r.x - d, y: r.y - d, w: r.w + d, h: r.h + d }))))

  return fromRects(eroded.map(r => ({ x: r.x, y: r.y, w: r.w + d, h: r.h + d })))
}

/** Shrink (erode) by g mm: shrink(A, g) = A − grow(complement(A), g). */
export function shrink(region: Region, g: number): Region {

  const box = bbox(region)
  if (g === 0 || box === null) {
    return region
  }

  const pad = g + 1
  const outer = fromRects([{ x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }])
  const complement = difference(outer, region)

  return difference(region, grow(complement, g))
}
