# Plan: walking-skeleton

Status: in progress — M1 and M2 done, **next: M3 (Task 12)**. See "Handoff notes" at the end.
Date: 2026-11-25
Sources: [design-spec.md](../design-spec.md), [solver-test-spec.md](../solver-test-spec.md)

## Goal

Get a usable end-to-end tool running quickly: draw a room, solve, and see the layout, metrics and
rule violations. Then improve it step by step. Open solver questions get **provisional defaults**
(listed below) and are revisited when real use shows a problem. The test catalog grows from
problems found while playing with the tool, not from listing every case up front.

The priority is **tools that make problems visible and easy to turn into tests.**

## Context

- This is a greenfield repo with only the two spec docs.
- The stack is fixed by the spec: TypeScript strict, Vite, Vitest, fast-check, Vue 3 + SVG.
- The pure-core rules from the spec still apply (no DOM/IO/random in `src/core`, integer mm,
  deterministic). They are cheap to enforce from day one and make every bug reproducible from a
  JSON file.

## Requirements (MVP)

1. As the floor owner, I want to enter a room as add/subtract rectangles with gaps, and see the
   layable area and any room errors.
2. As the floor owner, I want to press Solve and see the plank layout, plank and pack count, waste %,
   lower bound and cut list.
3. As the floor owner, I want every rule violation listed and highlighted on the drawing, so I can
   spot bad layouts immediately.
4. As the floor owner, I want to export any room as a fixture with one click, so that a problem I
   find becomes a regression test.
5. As the developer, I want a CLI that solves a project JSON and prints an ASCII layout plus
   violations, so I can reproduce exactly what the user sees.
6. As the developer, I want random rooms fuzzed through solve and then validate, so the computer
   finds bugs as well.

## Provisional defaults (revisit as we learn)

- **Stagger adjacency:** joints in rows k and k+1 are compared only if the line between the rows
  has unbroken material across the span between the two joints. The bound is inclusive.
- **Pins:** the solver keeps the pins. Any rule breaks are returned as violations with status
  `ok-with-violations`. A pin that can't be built at all gives `infeasible`. A pin on a row that
  doesn't exist is ignored, with a warning.
- **Offcuts** can be cut again. Each cut uses the kerf, and a piece keeps only the factory ends it
  still has. Pieces shorter than `minPieceLength` are waste.
- **Tie-break order:** planks → cuts (including rip cuts) → more usable leftover → decision
  sequence. As a result, a room that is an exact multiple of the plank width gets no rip.
- **Thin-strip rows** are reported as infeasible. There is no aesthetic score, and spare % = 0.
- **Hand-solved rooms (OPT-004):** 2413×228 → 1, 2413×456 → 2, 2000×456 → 2, 3000×456 → 3,
  4826×456 → 5, 4826×684 → 7.

## Design

### Architecture

The module layout follows design spec §3.2. It is built in a deliberately thin order:

1. **Geometry and layable region:** the exact foundation.
2. **Rows, layout model and validator:** the oracle comes before any solver.
3. **Greedy solver and report:** the first end-to-end result.
4. **CLI, fixture runner and fuzz test:** the problem-detection tools.
5. **Minimal Vue UI:** number-input shape table, SVG view, metrics, violations, fixture export.
6. **Beam optimizer and pins:** replaces greedy as the default; greedy stays as the baseline.

Things left out for now:

- The Web Worker. Solving runs on the main thread with a modest iteration budget.
- Drag handles, snapping and the expression parser.
- Migrations beyond the version check.
- Playwright.

### Data models

- **`Rect`** `{x, y, w, h}` in integer mm, half-open.
- **`Region`** is a canonical list of disjoint rects, produced from a compressed grid: collect all
  x/y edges, mark the cells, then merge them into maximal horizontal runs. Two equal regions
  always give the same list, so deep equality works in tests.
- **Region operations** run on the compressed grid:
  - `union` and `difference`;
  - `grow(g)`: grow each rect, then take the union (dilation distributes over union);
  - `shrink(g) = complement(grow(complement, g))` within a padded bounding box;
  - `area` (exact) and `components`, which uses flood fill over cells that share an edge of
    positive length.
- **`Frame`** `{direction, startCorner, bbox}` with the `toSolver` and `toWorld` functions.
- **`Layout`** has the shape `{ frame, rip, rows: Row[] }`, where:
  - `Row` is `{ index, y0, y1, segments: Segment[] }`;
  - `Segment` is `{ x0, x1, pieces: Piece[] }`;
  - `Piece` is `{ id, x0, x1, source: { plank, from, to } }`. `source` is the interval
    `[from, to)` of the original plank, measured from its L end.
  - The piece kind is derived, not stored: `from === 0` means it has an L end, and
    `to === length` means it has an R end.
  - Material accounting is then just interval checking: pieces of the same plank must not overlap
    and must be at least `kerf` apart.
- **`Violation`** `{ rule, severity, row?, x?, detail }`.
- **Fixture file:** the same project JSON as the export, plus an optional
  `expect: { maxPlanks?, status? }` and a `note`.

### Interfaces

- `computeLayable(project) → { region, issues: Violation[] }`
- `sliceRows(region, rip, plank) → Row skeletons`. Each has segments plus cross-section helpers.
- `validate(project, layout) → Violation[]`. It is independent of the solver.
- `solveGreedy(project) → SolveResult`
- `solve(project, options) → SolveResult`. It returns `explored` and a `debug` block: the rips
  tried, the best score per rip, and the start length chosen for each segment.
- `report(project, layout) → { cutList, layingOrder, metrics }`

### Problem-detection tooling

- **CLI** `npm run solve -- path.json [--greedy] [--budget N]`. It prints the metrics, an ASCII
  layout (rows by joints, with piece ids), the violations and debug info. It runs `src/core`
  directly through `tsx`.
- **Fixture runner** `tests/fixtures.test.ts`. It finds every file in `tests/fixtures/rooms/`,
  solves it, then asserts that:
  - `validate()` returns no errors;
  - planks ≥ the lower bound;
  - planks ≤ `expect.maxPlanks` (when set);
  - the optimizer is no worse than greedy;
  - two runs give deep-equal results.

  To add a regression test, you only drop in a file.
- **Fuzz test** (fast-check): random rectilinear rooms → solve → validate. Shrunk failing cases are
  printed as project JSON, ready to save as a fixture.
- **UI:**
  - a violations list, where clicking an item highlights it on the SVG;
  - a debug panel with lower bound, gap, explored states, greedy vs optimizer, rip and per-row
    start lengths;
  - an "Export as fixture" button.

### UI components (minimal)

- `App.vue` holds the project state and does a simple localStorage autosave inside try/catch.
- `ShapeTable.vue`: add/edit/delete shapes as number fields.
- `ProductPanel.vue`: plank, rules and layout settings.
- `FloorView.vue`: an SVG of the shapes, the layable region, the pieces coloured by plank and
  numbered by laying order, and violation markers.
- `ResultsPanel.vue`: metrics, cut list, violations and the debug panel.
- `ImportExport.vue`: JSON export and import, and the fixture export.

## Tasks

Each task is TDD: write the test(s) named with catalog IDs, then implement, then mark the IDs as
`covered` in `solver-test-spec.md`.

### M1 Scaffold and geometry

- [x] Task 1: Project scaffold
  - Files: `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`,
    `eslint.config.js`, `.gitignore`
  - Action: Set up Vite + Vue + TS strict, Vitest (core in the node env), fast-check and tsx. Give
    core its own tsconfig without DOM, and add the ESLint import restriction for `src/core`.
  - Context: Everything else depends on this.
- [x] Task 2: Model types and defaults
  - Files: `src/core/model/types.ts`, `src/core/model/defaults.ts`, `src/core/model/parse.ts`
  - Action: Add the Project/Layout/Violation types, defaults, and `parseProject` (version check,
    type checks, defaults filled in; errors returned as data).
  - Context: Covers MIG-002…004. A real migration chain comes with the first schema change.
- [x] Task 3: Region core
  - Files: `src/core/geometry/region.ts`, `tests/core/geometry/region.test.ts`
  - Action: Add the compressed grid, canonical rect list, union, difference, area, components.
  - Context: Covers GEO-001…005, 007, 012, 018–020.
- [x] Task 4: Grow and shrink
  - Files: `src/core/geometry/morph.ts`, `tests/core/geometry/morph.test.ts`
  - Action: Add `grow` and `shrink` using the complement.
  - Context: Covers GEO-013 and GEO-015.
- [x] Task 5: Layable region and room validity
  - Files: `src/core/layable/layable.ts`, `tests/core/layable/layable.test.ts`
  - Action: Compute the layable region from the project, and check: empty, disconnected,
    too-narrow warning, subtract outside every add, invalid shape.
  - Context: Covers GEO-006, 008–011, 014, 016, 017, 021.

### M2 Rows, validator, greedy, report

- [x] Task 6: Frame transform
  - Files: `src/core/geometry/frame.ts`, `tests/core/geometry/frame.test.ts`
  - Action: Add the direction/corner normalization and its inverse, with a round-trip property
    test.
  - Context: Covers TRF-001 and TRF-002.
- [x] Task 7: Row slicing
  - Files: `src/core/rows/rows.ts`, `tests/core/rows/rows.test.ts`
  - Action: Add bands for a given rip, segments, the cross-section strips at x, and the min
    material width check for an x-interval.
  - Context: Covers ROW-002…005, 007–011.
- [x] Task 8: Validator, part 1
  - Files: `src/core/validate/validate.ts`, `tests/core/validate/validate.test.ts`
  - Action: Check coverage, end types, min piece length, min width, and material/kerf accounting.
    Build the layouts by hand.
  - Context: Covers PCK-006…009, ROW-012. This is the oracle and must exist before any solver.
- [x] Task 9: Validator, part 2
  - Files: same as Task 8
  - Action: Check stagger (provisional adjacency), second-row stagger, and pins.
  - Context: Covers STG-001…006.
- [x] Task 10: Greedy solver
  - Files: `src/core/solver/greedy.ts`, `src/core/solver/solve-types.ts`,
    `tests/core/solver/greedy.test.ts`
  - Action: Take the first valid rip from coverWidth downward. For each segment, reuse a legal
    offcut, otherwise open a plank. Search a start length that satisfies stagger. Every output is
    validated.
  - Context: This is the first end-to-end result. Covers PCK-001…005, 010–012.
- [x] Task 11: Report
  - Files: `src/core/report/report.ts`, `tests/core/report/report.test.ts`
  - Action: Build the cut list, laying order, and metrics (waste, lower bound, gap, packs).
  - Context: Covers RPT-001…004.

### M3 Problem-detection tools

- [ ] Task 12: CLI and ASCII renderer
  - Files: `scripts/solve.ts`, `src/core/report/ascii.ts`
  - Action: `npm run solve -- file.json` prints metrics, the layout, violations and debug info.
  - Context: Lets me reproduce anything the user sees.
- [ ] Task 13: Fixture runner and seed fixtures
  - Files: `tests/fixtures.test.ts`, `tests/fixtures/rooms/*.json`
  - Action: Auto-discover the fixtures and check the invariants. Seed it with the six hand-solved
    rooms plus an L-shaped room and a kitchen-island room.
  - Context: Covers OPT-001, OPT-003, OPT-004.
- [ ] Task 14: Fuzz test
  - Files: `tests/fuzz.test.ts`, `tests/arbitraries.ts`
  - Action: A fast-check generator of random rooms. Solve, then validate. Failing cases are printed
    as fixture JSON.
  - Context: Covers OPT-007 and OPT-008.

### M4 Minimal UI

- [ ] Task 15: App shell and state
  - Files: `index.html`, `src/main.ts`, `src/ui/App.vue`, `src/ui/useProject.ts`
  - Action: Project state, a default example room, and localStorage autosave inside try/catch.
- [ ] Task 16: Shape table and product panel
  - Files: `src/ui/ShapeTable.vue`, `src/ui/ProductPanel.vue`
  - Action: Number-field editing of shapes, plank, rules and layout.
- [ ] Task 17: Floor view
  - Files: `src/ui/FloorView.vue`
  - Action: SVG with zoom-to-fit: shapes, the layable region, the gap band, room issues, and pieces
    coloured by plank and numbered.
- [ ] Task 18: Results, violations and debug panel
  - Files: `src/ui/ResultsPanel.vue`
  - Action: Metrics, cut list, a violation list that highlights items on the floor view, the debug
    panel, and a greedy/optimizer toggle.
- [ ] Task 19: Import/export and fixture export
  - Files: `src/ui/ImportExport.vue`
  - Action: Export and import JSON, plus "Export as fixture" with the current result as
    `expect.maxPlanks` and a note field.

### M5 Optimizer

- [ ] Task 20: Beam search optimizer
  - Files: `src/core/solver/beam.ts`, `src/core/solver/solve.ts`, `tests/core/solver/beam.test.ts`
  - Action: Outer rip loop, beam over rows/segments, candidate start lengths (offcut matches,
    stagger edges, a grid), scoring, the tie-break order, the iteration budget, and the debug block.
  - Context: Covers OPT-002, 005, 006 and STG-007. The fixture runner then checks it is no worse
    than greedy.
- [ ] Task 21: Pins
  - Files: `src/core/solver/solve.ts`, `tests/core/solver/pins.test.ts`, `src/ui/ResultsPanel.vue`
  - Action: firstRowRip and rowStartLengths pins in the solver (provisional semantics), plus
    simple pin inputs in the UI.
  - Context: Covers PIN-001…006.
- [ ] Task 22: Record the provisional decisions in the specs
  - Files: `docs/design-spec.md`, `docs/solver-test-spec.md`
  - Action: Add the provisional defaults and the OPT-004 rooms, and update the statuses.

## Handoff notes

Updated after each milestone so work can continue on another machine or in a new session.

### State after M2 (2026-11-25)

- All of `src/core` except the beam optimizer exists:
  - model and parsing
  - geometry, layable region and frame transform
  - rows
  - validator
  - greedy solver
  - report
- 145 tests pass. `npm test`, `npm run typecheck` and `npm run lint` are clean.
- `npm run solve` is declared in `package.json`, but `scripts/solve.ts` doesn't exist yet (Task 12).

### Known limitations (expected, not bugs)

- **The greedy stagger check is conservative.** It compares against *every* joint in the previous
  row and ignores the "unbroken contact" rule, and it never backtracks. Around obstacles many rips
  fail. On a 7 × 4.2 m room with an island, 25 of 38 rips failed at row 8, and the result was
  55 planks against a lower bound of 52. The beam optimizer (Task 20) is meant to fix this.
- **Pins:** a pin that can't be met currently gives `infeasible`. The provisional
  `ok-with-violations` status is defined in `SolveStatus` but not produced yet (Task 21).
- **Interpretation choice:** GEO-021 `too-narrow` is implemented as "no minRipWidth ×
  minRipWidth square fits", which also flags long thin corridors.

### Test helpers to reuse

- `tests/core/builders.ts`: `testProject` (defaults from the test spec, gaps 0), and `seg`, `row`,
  `layout` and `run` for building layouts by hand.
- `tests/core/solver/invariants.ts`: `expectValidSolution` checks status ok, the validator, the
  lower bound and determinism. Use it in every solver test.
- `tests/core/geometry/pixels.ts`: a brute-force pixel oracle and the `smallRect` arbitrary for
  property tests.
