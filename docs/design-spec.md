# Parkettsimulator — Design Spec

Status: Draft v0.1 (2026-11-25)

## 1. Purpose

A browser tool that plans a floating plank floor (parkett/laminat) laid in a shipdeck pattern
(long, narrow planks, e.g. 232 × 2413 mm), so that:

1. The user draws a room from simple rectangles.
2. The user specifies the plank product and laying rules.
3. The optimizer computes a layout that uses as few planks as possible while obeying the rules.
4. The user can "pin" choices (e.g. the first row's rip width, or the first piece's length). The
   solver then completes the rest, so the user can try alternatives by hand.

Output: a visual layout, a cut list, the order to lay pieces in, waste %, and how many packs to buy.

## 2. Scope

### In scope (v1)

- One room per project.
- Rooms made only of axis-aligned rectangles (`add` / `subtract`).
- An expansion gap at the walls, plus an expansion gap set per obstacle.
- Shipdeck pattern with a single laying direction (along x or y).
- An optimizer that also takes manual pins.
- Persistence in browser storage, plus JSON export/import with versioned migrations.
- No backend.

### Out of scope (v1)

- Several rooms per project, or sharing offcuts between rooms.
- Non-rectilinear walls (angled or curved).
- Other patterns (herringbone, chevron, …).
- Reusing the strips left over from ripping planks lengthwise. These count as waste.
- Rotating planks 180°. This is not allowed: the long-edge tongue and groove must face the same way.

## 3. Architecture

### 3.1 Principle: the solver is a pure core

All domain logic (geometry, solver, validator, data model, migrations) lives in a **pure core**:

- No DOM, browser globals, `localStorage`, `Date.now()`, `Math.random()` or I/O.
- Deterministic: the same input always gives the same output. If randomness is ever needed, it
  comes from a seeded PRNG passed in as a parameter.
- Plain data in and plain data out (JSON-serializable). No classes with hidden state across calls.
- Integer millimetres everywhere. No floating-point geometry.

This is **enforced by tooling**, not just convention:

- `src/core` has its own `tsconfig` with `"lib": ["ES2022"]` (no `DOM`), so browser APIs don't
  compile there.
- ESLint `no-restricted-imports` forbids `src/core/**` from importing `src/ui`, `src/storage` or
  `src/worker`.
- Core tests run in Vitest's `node` environment (no jsdom).

### 3.2 Module layout

```
src/
  core/
    model/       types, defaults, JSON schema, migrations
    geometry/    integer rectilinear regions: union, difference, grow/shrink, connectivity
    layable/     project -> layable region (applies gaps), validation of the room
    rows/        slicing the layable region into rows, segments and piece shapes
    solver/      packing a row, beam search, outer optimizer, pins
    validate/    an independent rule checker for any complete layout
    report/      cut list, laying order, waste, pack count
  worker/        thin Web Worker wrapper around core/solver (progress, cancel)
  storage/       localStorage adapter, export/import
  ui/            editor, canvas, panels, results view
tests/
  fixtures/      project JSON files (same format as export)
```

Dependencies only point downward: `ui → worker/storage → core`. Core depends on nothing else in
the app.

### 3.3 Key design choice: an independent validator

`core/validate` checks any complete layout against all rules **without sharing code with the
solver** apart from types and geometry primitives. It's used to:

- check every solver output in tests (the validator acts as the oracle);
- check user-pinned or edited layouts in manual mode;
- report rule violations as data (`{ rule, location, detail }`), never by throwing an exception.

### 3.4 Tech stack (proposed)

- TypeScript (strict), Vite, Vitest, fast-check (property-based tests).
- UI: Vue 3 (Composition API, `<script setup>`) with SVG rendering. The room has few shapes, so SVG
  gives easy hit-testing and crisp dimension labels.
- Playwright for a few end-to-end smoke tests later.

## 4. Domain model

### 4.1 Coordinates

- Integer millimetres. x points right and y points down, as in SVG.
- The solver always works in a **normalized frame**: planks run along x, and rows stack along y
  starting from y = min. Laying direction `y` and the four start corners are handled by a
  reversible transform (swap and/or mirror) before and after solving.

### 4.2 Project (persisted)

```json
{
  "version": 1,
  "id": "uuid",
  "name": "Stue",
  "room": {
    "wallGap": 10,
    "shapes": [
      { "id": "a1", "op": "add",      "x": 0,    "y": 0,    "w": 7000, "h": 4200 },
      { "id": "s1", "op": "subtract", "x": 3000, "y": 1800, "w": 1200, "h": 800,
        "label": "Kjøkkenøy", "gap": 10 }
    ]
  },
  "plank": {
    "length": 2413, "width": 232, "coverWidth": 228,
    "kerf": 3, "planksPerPack": 6
  },
  "layout": { "direction": "x", "startCorner": "top-left" },
  "rules": {
    "minJointOffset": 500,
    "minJointOffsetSecondRow": 0,
    "minPieceLength": 300,
    "minRipWidth": 50
  },
  "pins": {
    "firstRowRip": null,
    "rowStartLengths": {}
  }
}
```

Field notes:

- `subtract.gap` is optional and defaults to `room.wallGap`. Set it to 0 for, e.g., a pipe.
- `coverWidth` is the visible width once laid (the nominal width minus the tongue). The solver
  uses `coverWidth`.
- `minJointOffsetSecondRow`: the minimum offset between joints two rows apart. 0 turns the rule off.
- `pins.rowStartLengths`: maps a row index to the length of that row's first piece. Pinning row 0
  is the "start with a pre-cut plank" case.
- The default rule values are suggestions; the user can always change them.
- **Inputs only.** Solver results are never stored; they are recomputed from inputs and pins.

### 4.3 Layable region

```
layable = shrink(union(adds), wallGap) − union(grow(subtract_i, gap_i))
```

- `grow`/`shrink` use a square structuring element, which keeps everything rectilinear.
  Dilation distributes over union, so `shrink(A, g) = complement(grow(complement(A), g))` can be
  computed exactly with rectangles.
- Geometry is implemented in-house on a compressed integer grid, rather than with a float clipping
  library. It is exact, small and easy to test.
- Area in the gap bands is **not** counted as floor to cover; skirting or trim covers it.

### 4.4 Room validity (computed on `layable`)

| Check | Severity |
|---|---|
| A shape has width or height ≤ 0 | error (rejected on input) |
| `layable` is empty | error |
| `layable` has more than one connected component (edge-adjacency only; corner-touching counts as disconnected) | error |
| A part of `layable` is narrower than `minRipWidth` in both directions | warning |
| A subtract shape doesn't intersect any add | warning |

Holes (obstacle islands) are allowed. Errors block the optimizer but not editing.

## 5. Layout model and rules

### 5.1 Rows

Rows stack from the start wall. Row 0 has width `firstRowRip`, where `minRipWidth ≤ firstRowRip ≤
coverWidth`. Each following row is `coverWidth` wide. The last row is whatever width remains.

The **band** of a row is the strip `[y0, y1)` it covers. Within a band, the **cross-section** at
position x is `layable ∩ band ∩ {x}`.

### 5.2 Segments

A **segment** is a maximal x-interval of a band where the cross-section is non-empty. A segment
ends where the band is completely blocked (at a wall or an obstacle).

- An obstacle that only partly covers the band does **not** end the segment. Pieces run past it
  and get a notch cut.
- **Cut ends are only allowed at segment ends.** A cut end against a partly-blocked cross-section
  would leave a visible cut joint in the middle of the floor.

### 5.3 Pieces

A piece is an x-interval `[a, b)` inside one segment. Its shape is `layable ∩ band ∩ [a, b)`, so a
piece can be ripped, notched, or have a hole in it.

Planks have a factory **left end** (L profile) and **right end** (R profile). Pieces are laid left
to right, and each piece's L end clicks into the previous piece's R end. Piece kinds by source:

| Kind | Factory ends | Usable as |
|---|---|---|
| Full plank | L + R | anywhere |
| R-piece (right part of a plank) | R only | first piece of a segment |
| L-piece (left part of a plank) | L only | last piece of a segment |
| C-piece (middle part) | none | single-piece segment only |

Cutting a plank of length P into lengths `u + v` consumes the kerf: `u + v + kerf = P`.

### 5.4 Rules (all checked by the validator)

1. **Coverage:** the pieces together cover `layable` exactly, with no overlaps.
2. **End types:** every piece's ends match the table above. Factory ends meet factory ends; cut
   ends only sit at segment ends.
3. **Min piece length:** every piece is at least `minPieceLength` long. A segment shorter than that
   makes the row configuration infeasible.
4. **Min material width:** at every x in a piece, every connected strip of material is at least
   `minRipWidth` wide. This covers ripped rows, notches, and material beside holes.
5. **Joint stagger:** for two adjacent rows, wherever both have an end joint, the joints are at
   least `minJointOffset` apart in x. Joints at segment ends (walls and obstacles) don't count.
6. **Second-row stagger** (if `minJointOffsetSecondRow > 0`): the same rule for rows k and k+2.
7. **Material accounting:** every piece comes from a plank or an earlier offcut, the kerf is
   accounted for, and no material is used twice.
8. **Pins** are respected. If a pin can't be satisfied, this is reported as a violation; it never
   crashes.

### 5.5 Objective

1. Primary: the number of planks used, i.e. opened.
2. Tie-breakers, in order: the number of rule-near-misses (joints just above the minimum), the
   number of cuts, and then the leftover length that is still usable.
3. Reported metrics:
   - waste % = `(planks × plankArea − layableArea) / (planks × plankArea)`
   - lower bound = `ceil(layableArea / (length × coverWidth))`
   - gap to the lower bound
   - packs = `ceil(planks / planksPerPack)`, with an optional suggested spare %.

## 6. Solver

### 6.1 Interface (pure)

```ts
solve(project: Project, options: SolveOptions): SolveResult

interface SolveOptions {
  beamWidth: number;          // e.g. 50
  ripStep: number;            // mm, e.g. 5
  startLengthStep: number;    // mm, e.g. 10
  maxIterations?: number;     // deterministic budget, not wall-clock
}

interface SolveResult {
  status: 'ok' | 'infeasible' | 'invalid-room';
  layout?: Layout;            // rows -> segments -> pieces with source plank ids
  metrics?: Metrics;
  violations: Violation[];    // pins that could not be met, infeasible reasons
  explored: number;           // states evaluated (for perf tests)
}
```

The budget is counted in **iterations, not time**, to keep results deterministic. The worker turns
a time budget into a series of calls with increasing budgets, and streams the best result so far.

### 6.2 Algorithm

1. **Normalize** the project into the solver frame (direction and start corner).
2. **Outer loop:** go through the `firstRowRip` candidates (or the pinned value) in `ripStep`
   steps. Drop any rip that makes some piece break the min-material-width rule.
3. **Slice** the region into rows, segments and cross-sections for that rip.
4. **Inner beam search** over the rows. The state holds:
   - the current row;
   - the offcut inventory (lists of R, L and C pieces, by length);
   - the joint positions of the previous one or two rows;
   - the planks opened so far.
5. **Per segment**, the decision is the first piece's length `s`. The full planks and the last
   piece follow from it. Candidate values for `s`:
   - lengths that reuse an offcut in the inventory exactly or nearly (prefer exact matches);
   - lengths at the edges of the stagger-feasible intervals;
   - a grid in `startLengthStep` steps.

   A pinned `rowStartLengths[row]` restricts the candidates to that single value.
6. **Segments shorter than a plank:** one piece (any kind, including a C-piece), or two pieces
   (R + L) if both satisfy `minPieceLength`.
7. **Scoring:** planks opened + an estimate for the rest:
   `ceil(remainingArea / plankArea) − usable inventory credit`. Keep the top `beamWidth` states.
8. **Choose** the best complete layout across all outer candidates, and run it through the
   validator before returning it. If the validator rejects the solver's own output, that is a bug
   and is reported as such.

### 6.3 Greedy baseline

A simple greedy algorithm (always reuse the previous row's offcut if it's legal, otherwise open a
new plank) is kept as a reference. Tests assert that the optimizer is **never worse** than greedy.

## 7. Editor (UI)

### 7.1 Shapes and handles

- Add a rectangle with the add tool or the subtract tool. A toggle in the properties panel switches
  `op` later on.
- Adds are drawn filled; subtracts are hatched with a red outline.
- **Corner handles** resize along both axes. **Edge handles** move a single wall.
- Select, move, duplicate, delete. An optional label on each shape.
- A subtract shape has a `gap` field. Empty means it inherits `wallGap`.

### 7.2 Precise input

- A snap grid with configurable steps (10/50/100 mm). Hold Alt to drag freely.
- Snapping to other shapes' edges and corners.
- Arrow keys nudge the selection by 1 mm, or by 10 mm with Shift.
- A **properties panel** with x, y, w, h and gap as number fields. This is the authoritative input.
- **Editable dimension labels** on edges: click a label and type a value. Simple arithmetic is
  accepted (`3500+1250`).
- **Anchor rule:** when a size is typed, the opposite edge stays fixed by default. An option resizes
  from the centre.

The snapping maths and the expression parser are pure functions with their own unit tests.

### 7.3 Feedback

- **Read-only wall lengths** around the resulting outline, to check against tape measurements.
- The gap bands are shown as a thin tinted strip.
- A **validation overlay**: disconnected parts are highlighted, plus a list of errors and warnings.
- Undo/redo (a stack of project snapshots). Zoom and pan.

## 8. Results and manual mode

- A plank layout view: each piece is coloured by its source plank and numbered in laying order.
- A cut list per source plank: for example, "Plank 7: cut at 1540 → piece R3-start (R) + piece R2-end (L)".
- A metrics panel showing planks, packs, waste %, the lower bound and the gap.
- **Manual mode:** set or clear pins (the first-row rip and the start length per row). The solver
  re-runs in the worker and the result updates live. Any violations are listed and highlighted.
- An "Optimize" button that clears the pins it doesn't need and searches freely.

## 9. Persistence

- **localStorage:** a project index plus one key per project. Autosave is debounced (~500 ms).
  Every read and write is wrapped in try/catch, and the app must still work if storage is
  unavailable.
- **Export:** download `<name>.parkett.json`. **Import:** upload a file, then migrate and validate it.
- **Migrations** (in `core/model`, pure): `migrations[v]` converts version v to v+1. On load, apply
  them in sequence until the current version.
  - Every schema change must add a fixture of the previous version to `tests/fixtures/migrations/`.
  - A file from a newer version is rejected with a clear message and is never partly loaded.
  - Missing optional fields get their defaults.
  - Exporting and then importing again must give back the same project.

## 10. Testing strategy

**Priority:** solver and optimizer first, then geometry, the validator and migrations. UI tests come
last.

- **Unit tests** for every core module. Core tests run in Node with no DOM.
- **Validator-as-oracle:** every solver test also runs the result through `validate()`.
- **Property-based tests** (fast-check) on generated rectilinear rooms check the invariants: valid
  output, planks ≥ lower bound, determinism, the transform round-trip, and never worse than greedy.
- **Golden fixtures:** real-world project JSON files in `tests/fixtures/rooms/`, each with a
  maximum expected plank count. These are regression thresholds, not exact layouts, so solver
  improvements don't break them.
- **Performance tests:** `explored` stays within a budget for reference rooms, so slowdowns get caught.

The edge-case catalog is a **living document**: [`solver-test-spec.md`](./solver-test-spec.md).

## 11. Open questions

- Should rows that are fully blocked except for a thin strip be filled with ripped strips, or
  reported for the user to handle by hand?
- Do we need a "random look" aesthetic score (avoid repeating joint patterns), or is the stagger
  rule enough?
- Should a suggested spare % (e.g. +5% for damaged planks) be built in or user-configurable?
