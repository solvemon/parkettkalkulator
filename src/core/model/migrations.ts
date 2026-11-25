import { CURRENT_VERSION } from './types'

/**
 * `migrations[v]` converts a project of version v into version v + 1.
 * Every new entry must come with a fixture of version v in `tests/fixtures/migrations/`.
 */
export const migrations: Record<number, (project: Record<string, unknown>) => Record<string, unknown>> = {}

export type MigrationResult =
  | { ok: true, json: Record<string, unknown> }
  | { ok: false, error: string }

export function migrate(json: Record<string, unknown>): MigrationResult {

  const version = json.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'version: missing or not a positive integer' }
  }
  if (version > CURRENT_VERSION) {
    return {
      ok: false,
      error: `version ${version} is newer than this app supports (${CURRENT_VERSION}); please update the app`,
    }
  }

  let current = json
  for (let v = version; v < CURRENT_VERSION; v++) {
    const step = migrations[v]
    if (!step) {
      return { ok: false, error: `no migration from version ${v}` }
    }
    current = step(current)
  }

  return { ok: true, json: current }
}
