import type { Violation } from '../model/types'
import type { Layout } from '../model/layout'
import type { Metrics } from '../report/report'

export type SolveStatus = 'ok' | 'ok-with-violations' | 'infeasible' | 'invalid-room'

export interface SolveOptions {
  beamWidth: number
  /** mm between first-row rip candidates. */
  ripStep: number
  /** mm between start-length candidates. */
  startLengthStep: number
  /** Deterministic budget (states evaluated), not wall-clock time. */
  maxIterations?: number
}

export const DEFAULT_SOLVE_OPTIONS: SolveOptions = {
  beamWidth: 50,
  ripStep: 5,
  startLengthStep: 10,
}

/** What happened for one first-row rip candidate. Shown in the debug panel and the CLI. */
export interface RipAttempt {
  rip: number
  outcome: 'ok' | 'skipped' | 'failed'
  planks?: number
  reason?: string
}

export interface SolveDebug {
  solver: 'greedy' | 'beam'
  rips: RipAttempt[]
}

export interface SolveResult {
  status: SolveStatus
  layout?: Layout
  metrics?: Metrics
  violations: Violation[]
  /** States evaluated, for performance tests. */
  explored: number
  debug: SolveDebug
}
