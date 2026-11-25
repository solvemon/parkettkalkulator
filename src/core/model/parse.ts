import { DEFAULT_LAYOUT, DEFAULT_RULES } from './defaults'
import { migrate } from './migrations'
import { CURRENT_VERSION } from './types'
import type { Direction, LayoutSettings, Pins, Plank, Project, Rules, Shape, StartCorner } from './types'

export type ParseResult =
  | { ok: true, project: Project }
  | { ok: false, errors: string[] }

const DIRECTIONS: readonly Direction[] = ['x', 'y']
const CORNERS: readonly StartCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

type Obj = Record<string, unknown>

function isObj(value: unknown): value is Obj {

  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses untrusted JSON (an import, or something read from storage) into a Project.
 * Migrates old versions, fills defaults for optional fields and validates types.
 * Never throws; on any error nothing is returned, so a project is never partly loaded.
 */
export function parseProject(input: unknown): ParseResult {

  if (!isObj(input)) {
    return { ok: false, errors: ['project: not a JSON object'] }
  }

  const migrated = migrate(input)
  if (!migrated.ok) {
    return { ok: false, errors: [migrated.error] }
  }

  const reader = new Reader()
  const project = readProject(reader, migrated.json)

  if (reader.errors.length > 0) {
    return { ok: false, errors: reader.errors }
  }

  return { ok: true, project }
}

class Reader {
  readonly errors: string[] = []

  int(obj: Obj, key: string, path: string, opts: { min?: number, fallback?: number } = {}): number {

    const value = obj[key]
    if (value === undefined && opts.fallback !== undefined) {
      return opts.fallback
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.errors.push(`${path}.${key}: expected an integer`)
      return 0
    }
    if (opts.min !== undefined && value < opts.min) {
      this.errors.push(`${path}.${key}: must be ≥ ${opts.min}`)
    }

    return value
  }

  str(obj: Obj, key: string, path: string, fallback?: string): string {

    const value = obj[key]
    if (value === undefined && fallback !== undefined) {
      return fallback
    }
    if (typeof value !== 'string') {
      this.errors.push(`${path}.${key}: expected a string`)
      return ''
    }

    return value
  }

  oneOf<T extends string>(obj: Obj, key: string, path: string, allowed: readonly T[], fallback: T): T {

    const value = obj[key]
    if (value === undefined) {
      return fallback
    }
    if (!allowed.includes(value as T)) {
      this.errors.push(`${path}.${key}: expected one of ${allowed.join(', ')}`)
      return fallback
    }

    return value as T
  }

  obj(obj: Obj, key: string, path: string, optional = false): Obj {

    const value = obj[key]
    if (value === undefined && optional) {
      return {}
    }
    if (!isObj(value)) {
      this.errors.push(`${path}.${key}: expected an object`)
      return {}
    }

    return value
  }
}

function readProject(r: Reader, json: Obj): Project {

  const room = r.obj(json, 'room', 'project')
  const plank = r.obj(json, 'plank', 'project')
  const layout = r.obj(json, 'layout', 'project', true)
  const rules = r.obj(json, 'rules', 'project', true)
  const pins = r.obj(json, 'pins', 'project', true)

  return {
    version: CURRENT_VERSION,
    id: r.str(json, 'id', 'project', 'project'),
    name: r.str(json, 'name', 'project', 'Untitled'),
    room: {
      wallGap: r.int(room, 'wallGap', 'room', { min: 0, fallback: 0 }),
      shapes: readShapes(r, room),
    },
    plank: readPlank(r, plank),
    layout: readLayout(r, layout),
    rules: readRules(r, rules),
    pins: readPins(r, pins),
  }
}

function readShapes(r: Reader, room: Obj): Shape[] {

  const shapes = room.shapes
  if (!Array.isArray(shapes)) {
    r.errors.push('room.shapes: expected an array')
    return []
  }

  return shapes.map((raw, i) => {

    const path = `room.shapes[${i}]`
    if (!isObj(raw)) {
      r.errors.push(`${path}: expected an object`)
      return { id: '', op: 'add' as const, x: 0, y: 0, w: 0, h: 0 }
    }

    const id = r.str(raw, 'id', path, `shape${i}`)
    const opValue = raw.op
    if (opValue !== 'add' && opValue !== 'subtract') {
      r.errors.push(`${path}.op: expected add or subtract`)
    }

    const shape: Shape = {
      id,
      op: opValue === 'subtract' ? 'subtract' : 'add',
      x: r.int(raw, 'x', path),
      y: r.int(raw, 'y', path),
      w: r.int(raw, 'w', path),
      h: r.int(raw, 'h', path),
    }
    if (shape.w <= 0 || shape.h <= 0) {
      r.errors.push(`${path} (${id}): width and height must be > 0`)
    }

    if (raw.label !== undefined) {
      shape.label = r.str(raw, 'label', path)
    }
    if (raw.gap !== undefined && raw.gap !== null) {
      shape.gap = r.int(raw, 'gap', path, { min: 0 })
    }

    return shape
  })
}

function readPlank(r: Reader, plank: Obj): Plank {

  const length = r.int(plank, 'length', 'plank', { min: 1 })
  const coverWidth = r.int(plank, 'coverWidth', 'plank', { min: 1 })

  return {
    length,
    width: r.int(plank, 'width', 'plank', { min: 1, fallback: coverWidth }),
    coverWidth,
    kerf: r.int(plank, 'kerf', 'plank', { min: 0, fallback: 3 }),
    planksPerPack: r.int(plank, 'planksPerPack', 'plank', { min: 1, fallback: 1 }),
  }
}

function readLayout(r: Reader, layout: Obj): LayoutSettings {

  return {
    direction: r.oneOf(layout, 'direction', 'layout', DIRECTIONS, DEFAULT_LAYOUT.direction),
    startCorner: r.oneOf(layout, 'startCorner', 'layout', CORNERS, DEFAULT_LAYOUT.startCorner),
  }
}

function readRules(r: Reader, rules: Obj): Rules {

  const d = DEFAULT_RULES

  return {
    minJointOffset: r.int(rules, 'minJointOffset', 'rules', { min: 0, fallback: d.minJointOffset }),
    minJointOffsetSecondRow: r.int(rules, 'minJointOffsetSecondRow', 'rules', { min: 0, fallback: d.minJointOffsetSecondRow }),
    minPieceLength: r.int(rules, 'minPieceLength', 'rules', { min: 1, fallback: d.minPieceLength }),
    minRipWidth: r.int(rules, 'minRipWidth', 'rules', { min: 1, fallback: d.minRipWidth }),
  }
}

function readPins(r: Reader, pins: Obj): Pins {

  const rip = pins.firstRowRip
  const firstRowRip = rip === undefined || rip === null ? null : r.int(pins, 'firstRowRip', 'pins')

  const starts = r.obj(pins, 'rowStartLengths', 'pins', true)
  const rowStartLengths: Record<string, number> = {}
  for (const key of Object.keys(starts)) {
    if (!/^\d+$/.test(key)) {
      r.errors.push(`pins.rowStartLengths: key "${key}" is not a row index`)
      continue
    }
    rowStartLengths[key] = r.int(starts, key, 'pins.rowStartLengths')
  }

  return { firstRowRip, rowStartLengths }
}
