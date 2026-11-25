# Parkettsimulator

A browser-only tool that optimizes a shipdeck plank floor layout for minimum waste.

- Specs: `docs/design-spec.md`, and `docs/solver-test-spec.md` (the living edge-case catalog).
- **Current plan and progress:** `docs/plans/walking-skeleton.md`. Its status line says what's
  next, and the "Handoff notes" at the end hold known limitations and test helpers. Tick tasks
  and update the handoff notes after each milestone.

## Working agreements

- **Iterate, don't over-specify.** Get things running, use provisional defaults for open
  questions, and grow the spec and tests from problems found while using the tool. Keep plan
  approval gates light.
- **Prefer tools that make problems visible:** violation highlights, debug info, a CLI repro, and
  fixture export.
- **Scope (v1):** one room per project, rectilinear add/subtract rectangles only. Don't expand
  scope unless asked.
- Each solver test is named with its catalog ID (`it('ROW-006: …')`). Mark the entry `covered`
  when its test lands. Never delete catalog entries.

## Core rules (enforced by tooling)

- `src/core` is pure and deterministic: no DOM, I/O, `Math.random` or `Date.now`. It has its own
  tsconfig without DOM, ESLint restrictions, and tests run in the node env.
- Integer millimetres only. Solver results are never persisted; only inputs are.
- The validator (`src/core/validate`) is independent of the solver and acts as the oracle for
  every solver test.

## Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run dev`
- `npm run solve -- file.json` (from Task 12)
