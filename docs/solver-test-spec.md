# Solver Test Spec (living document)

This is the catalog of behaviours and edge cases the core must handle. It **grows over time**.

## Process

1. When we find a new edge case, a bug or a surprising layout, **add an entry here first**. It gets
   an ID, a description, an input and the expected result.
2. Write a failing test that references the ID in its name, e.g.
   `it('ROW-012: obstacle edge 1mm inside band yields sliver violation', …)`.
3. Fix or implement until the test passes. Change the entry's status to `covered`.
4. Never delete an entry. If the expected behaviour changes, update the entry and note why.
5. When a real room shows a problem, save it as a fixture in `tests/fixtures/rooms/` and refer to
   it from the entry.

**Status values:** `planned` · `covered` · `known-gap` (accepted limitation, documented).

**Invariants checked by every solver test, implicitly:** the output passes `validate()`, the plank
count is at least the lower bound, and the result is deterministic.

Default test product unless stated otherwise: length 2413, coverWidth 228, kerf 3, minPieceLength
300, minRipWidth 50, minJointOffset 500, wallGap 0. Gaps are 0 so the numbers are easy to work out
by hand.

---

## GEO — Geometry (regions, gaps, connectivity)

| ID | Case | Expected | Status |
|---|---|---|---|
| GEO-001 | Single rectangle | layable = the rectangle; area exact | covered |
| GEO-002 | Two overlapping adds | union; area counted once | covered |
| GEO-003 | Two adds sharing a full edge | one region, one component | covered |
| GEO-004 | Two adds touching only at a corner | 2 components → `disconnected` error | covered |
| GEO-005 | Two adds sharing a partial edge (overlap > 0 mm) | connected | covered |
| GEO-006 | Add with w = 0 or h = 0 | rejected at input | covered |
| GEO-007 | Subtract fully inside an add | a hole; area reduced | covered |
| GEO-008 | Subtract touching a wall | becomes a notch, not a hole | covered |
| GEO-009 | Subtract splitting the floor in two | `disconnected` error | covered |
| GEO-010 | Subtract covering everything | `empty` error | covered |
| GEO-011 | Subtract outside every add | no effect + warning | covered |
| GEO-012 | Overlapping subtracts | union of the subtracts | covered |
| GEO-013 | Shrinking an L-shaped room by the wall gap | the inner corner moves correctly; region stays rectilinear | covered |
| GEO-014 | A corridor narrower than 2 × wallGap | gaps split the floor → `disconnected` | covered |
| GEO-015 | Obstacle gap overlapping the wall gap | merges correctly; no negative-width slivers | covered |
| GEO-016 | Obstacle `gap` missing | inherits wallGap | covered |
| GEO-017 | Obstacle `gap` = 0 next to a wall with wallGap 10 | each uses its own gap | covered |
| GEO-018 | Negative coordinates | works the same as positive | covered |
| GEO-019 | Very large room (20 m × 15 m) | exact integer area, no overflow | covered |
| GEO-020 | 1 mm features | handled exactly; no float drift | covered |
| GEO-021 | Part of layable where no minRipWidth × minRipWidth square fits (also catches long thin corridors) | `too-narrow` warning with the areas to highlight | covered |

## TRF — Normalization transform

| ID | Case | Expected | Status |
|---|---|---|---|
| TRF-001 | direction y | swap x/y; round-trip gives the original layout | planned |
| TRF-002 | Each of the 4 start corners | mirroring round-trips | planned |
| TRF-003 | A mirrored room with a mirrored start corner | same plank count | planned |

## ROW — Rows, bands, segments, cross-sections

| ID | Case | Expected | Status |
|---|---|---|---|
| ROW-001 | Room width = n × coverWidth exactly | possible with no rip, or with a balanced rip | planned |
| ROW-002 | Remainder < minRipWidth | the first row must be ripped so the last row is ≥ minRipWidth | planned |
| ROW-003 | Room narrower than one coverWidth | a single ripped row | planned |
| ROW-004 | Room narrower than minRipWidth | `infeasible` | planned |
| ROW-005 | Obstacle edge exactly on a row boundary | no notch in either row | planned |
| ROW-006 | Obstacle edge 1 mm inside a band | sliver → this rip is rejected; the optimizer picks another rip | planned |
| ROW-007 | Obstacle fully blocking a band | two segments, with cut ends at the obstacle | planned |
| ROW-008 | Obstacle partly covering a band | one segment; pieces get a notch | planned |
| ROW-009 | Small obstacle inside a band (pipe) | a piece with a hole; material either side ≥ minRipWidth, or reject | planned |
| ROW-010 | Wall jog in the middle of the last row | an L-shaped (notched) piece | planned |
| ROW-011 | Cross-section split into two strips along a whole piece | rejected / infeasible for that configuration | planned |
| ROW-012 | Obstacle ending partway along a piece, with a cut end needed there | not allowed (cut ends only at segment ends) | planned |

## PCK — Packing within a segment

| ID | Case | Expected | Status |
|---|---|---|---|
| PCK-001 | Segment = plank length | one full plank, no cuts | planned |
| PCK-002 | Segment = 2 × plank length | two full planks | planned |
| PCK-003 | Segment slightly longer than a plank (e.g. +100) | no piece < minPieceLength: e.g. R-piece + L-piece, both ≥ 300 | planned |
| PCK-004 | Segment < minPieceLength | `infeasible` for that configuration | planned |
| PCK-005 | Segment shorter than a plank | a single piece; a C-piece is allowed | planned |
| PCK-006 | Kerf accounting | u + v + kerf = P for every cut | planned |
| PCK-007 | An R-piece offered for the end of a row | rejected (wrong end type) | planned |
| PCK-008 | An L-piece offered for the start of a row | rejected | planned |
| PCK-009 | A C-piece offered inside a multi-piece segment | rejected | planned |
| PCK-010 | An offcut exactly matching the needed start length | reused; no new plank | planned |
| PCK-011 | An offcut 1 mm too short | not used | planned |
| PCK-012 | Offcut shorter than minPieceLength after the cut | counted as waste; never placed | planned |

## STG — Joint stagger

| ID | Case | Expected | Status |
|---|---|---|---|
| STG-001 | Adjacent rows with joints 499 mm apart (min 500) | violation | planned |
| STG-002 | Joints exactly 500 mm apart | allowed (the bound is inclusive) | planned |
| STG-003 | A joint aligned with a segment end in the next row | no violation (segment ends are not joints) | planned |
| STG-004 | Rows overlap in x only partly (obstacle) | only the overlapping range is compared | planned |
| STG-005 | Second-row rule turned off (0) | rows k and k+2 not compared | planned |
| STG-006 | Second-row rule turned on | rows k and k+2 checked | planned |
| STG-007 | Stagger forces a new plank instead of reusing an offcut | the optimizer accepts the extra plank; output is valid | planned |

## PIN — Pins / manual mode

| ID | Case | Expected | Status |
|---|---|---|---|
| PIN-001 | firstRowRip pinned to a valid value | used exactly | planned |
| PIN-002 | firstRowRip < minRipWidth | violation reported, no crash | planned |
| PIN-003 | rowStartLengths[0] pinned | row 0 starts with that length | planned |
| PIN-004 | Pinned start length breaks the stagger with the previous row | violation reported; the rest is still solved if possible | planned |
| PIN-005 | Pin on a row index that doesn't exist | ignored + warning | planned |
| PIN-006 | Pins that cost planks | result ≥ the unpinned optimum (sanity check) | planned |

## OPT — Optimizer properties

| ID | Case | Expected | Status |
|---|---|---|---|
| OPT-001 | Determinism | identical input → identical output (deep equality) | planned |
| OPT-002 | Never worse than greedy | planks(opt) ≤ planks(greedy) on all fixtures and generated rooms | planned |
| OPT-003 | Lower bound | planks ≥ ceil(layableArea / plankArea) | planned |
| OPT-004 | Hand-solved small rooms | exact known optimal plank counts (list rooms below) | planned |
| OPT-005 | Iteration budget | stops within `maxIterations`; returns the best so far | planned |
| OPT-006 | More budget never makes it worse | planks(budget 2N) ≤ planks(budget N) | planned |
| OPT-007 | Property test: random rectilinear rooms | the validator always passes, or status is `infeasible` with a reason | planned |
| OPT-008 | Infeasible room (e.g. a too-narrow corridor) | `infeasible` with reasons, no exception | planned |

Hand-solved rooms for OPT-004 (to be filled in as we work them out):

- _e.g. 4826 × 456 (2 rows × 2 planks, no gap): stagger makes 4 full planks impossible → expected N_

## RPT — Reporting

| ID | Case | Expected | Status |
|---|---|---|---|
| RPT-001 | Waste % is based on the layable area (gaps excluded) | formula from design spec §5.5 | planned |
| RPT-002 | Pack count | ceil(planks / planksPerPack) | planned |
| RPT-003 | The cut list accounts for every opened plank | the sum of pieces + kerf + waste = planks × length | planned |
| RPT-004 | Laying order | row by row from the start corner; left to right within a row | planned |

---

## Secondary areas

### MIG — Model and migrations

| ID | Case | Expected | Status |
|---|---|---|---|
| MIG-001 | A fixture for every past version migrates to the current version | passes schema validation | planned |
| MIG-002 | Version newer than the app supports | rejected with a clear message | covered |
| MIG-003 | Missing optional fields | defaults applied | covered |
| MIG-004 | Invalid JSON or wrong types | rejected with an error, not partly loaded | covered |
| MIG-005 | Export → import round-trip | deep-equal project | covered |

### STO — Storage adapter

| ID | Case | Expected | Status |
|---|---|---|---|
| STO-001 | localStorage throws (private mode) | the app works without persistence; the user is told | planned |
| STO-002 | Corrupt stored project | skipped with a warning; other projects still load | planned |

### UI — Pure editor helpers

| ID | Case | Expected | Status |
|---|---|---|---|
| UI-001 | Snap to grid at each step size | correct rounding, including negative values | planned |
| UI-002 | Snap to nearby shape edges | within the threshold only | planned |
| UI-003 | Expression input (`3500+1250`, `7000-2*228`) | evaluates; invalid input rejected | planned |
| UI-004 | Resize anchoring (opposite edge fixed / centre) | correct x/y/w/h | planned |
