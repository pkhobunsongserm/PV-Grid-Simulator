# Phase 2 — Types, Simulation Engine, and Tests

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Build the actual "brain" of the app — the pure calculation logic — in
complete isolation from any UI, and prove it's correct with automated tests,
before writing a single line of React. This was flagged as the
highest-risk phase in the plan: the dispatch rules (what charges/discharges
when, and why) are easy to get subtly backwards, so getting them right in
isolation, with tests, was worth doing before anything depended on them.

## What I built

- **`lib/types.ts`** — every TypeScript interface used by the app: the shape
  of the three reference JSON files, the ~15 user-configurable inputs
  (`SimulationInputs` and its sub-sections), the per-hour simulation output
  (`HourlyState`), and the results shapes (`SimulationResult`,
  `OutageResult`, `FinancialSummary`, `SensitivityMatrixCell`, `PresetConfig`).
- **`lib/constants.ts`** — fixed numbers pulled out of the engine so they're
  easy to find and question: the battery's 10kW rate limit, the outage
  simulator's 168-hour safety cap, the sensitivity matrix's step values, the
  default cost assumptions, and `DEFAULT_SIMULATION_INPUTS` (what every
  slider starts at).
- **`lib/v2g-simulation.ts`** — the engine itself:
  - `scaleReferenceData()` — the proportional scaling formula for solar/demand.
  - `isEvAway()` — commute-schedule logic, including overnight wraparound.
  - `runHourlyDispatch()` — the 7-step dispatch priority order, run once per
    simulated hour.
  - `computeBaselineScenario()` + `computeFinancials()` — the "what would this
    have cost with no equipment?" comparison and the resulting payback math.
  - `runOutageSimulation()` — the blackout survival calculation.
  - `runFullSimulation()` — a convenience wrapper chaining all of the above.
  - `runSensitivityMatrix()` — the 63-cell (9×7) Reserve SoC × Stationary
    Capacity grid sweep.
- **`lib/presets.ts`** — "Commuter EV" (the baseline defaults), "Off-Grid
  Heavy" (maxed battery/EV/solar for resilience), and "Solar Max" (maxed
  solar, low reserve, for fastest payback), plus `buildPresetInputs()`, which
  merges a preset's partial overrides onto the defaults section by section.
- **`lib/format.ts`** — small display-formatting helpers (currency, payback
  years, survival hours, percentages, clock times) — created in this phase
  even though nothing used them yet, so later UI phases wouldn't each
  reinvent the same formatting logic.
- **`lib/__tests__/v2g-simulation.test.ts`** — 7 automated tests (6 required
  by the plan, plus a bonus regression check), run against the real reference
  data, not made-up fixtures.

## Key decisions & reasoning

Every one of these was already decided during planning and documented in
README.md's "Locked decisions" section — this phase's job was implementing
them exactly, not re-deciding them. The ones worth calling out here because
they're the easiest to get wrong when implementing from scratch:

- **Dispatch priority order is a fixed 7-step sequence, run fresh every
  hour** (solar→home, solar surplus→stationary, remaining surplus→EV,
  remaining surplus→export, unmet→stationary discharge, remaining
  unmet→EV V2G *only during Evening Peak*, remaining unmet→grid import). I
  implemented this as one straight-line function rather than splitting it
  into smaller "for each priority level" helper functions, specifically so
  the order is visually obvious just by reading top-to-bottom — a reader
  shouldn't have to trace function calls to find out what happens first.
- **The Reserve SoC / EV Discharge Floor asymmetry** (stationary drains to 0%
  in an outage, EV floor stays hard even in an outage) is implemented as two
  genuinely different code paths, not a shared "floor" concept with a flag —
  `runHourlyDispatch()` respects the stationary reserve floor;
  `runOutageSimulation()` deliberately does *not* apply it to the stationary
  battery, while still applying the EV's floor in both places. Keeping these
  as separate, explicit calculations (rather than one clever unified
  function) was a deliberate readability choice — the asymmetry is the whole
  point, so the code shouldn't hide it behind abstraction.
- **The baseline scenario reuses the real dispatch function** instead of a
  second, hand-written cost formula. `computeBaselineScenario()` just calls
  `runHourlyDispatch()` again with battery/solar zeroed and the EV
  permanently away. This was a correctness decision: a second formula could
  quietly drift out of sync with the real one over time; reusing the same
  function makes that impossible by construction.

## Problems encountered & how I fixed them

- **`npx vitest run` failed immediately** with
  `Error [ERR_REQUIRE_ESM]: require() of ES Module .../std-env/dist/index.mjs not supported`
  — a module-loading conflict between this version of Vitest and a plain
  `.ts` config file. Renamed `vitest.config.ts` → `vitest.config.mts` to
  force it to load as an ES module, the same fix pattern this scaffold
  already uses for `next.config.mjs` and `postcss.config.mjs`. No behavior
  change, just a filename — confirmed by re-running the tests immediately
  after and getting a clean pass.

## Verification

- `npx vitest run` (via `npm test`) — all 7 tests green:
  1. Zero equipment matches a hand-computed grid-only baseline.
  2. Midday solar surplus charges the stationary battery with zero grid import.
  3. The stationary battery never dips below its reserve floor in normal operation.
  4. A blackout starting while the EV is away shows zero EV contribution.
  5. The EV never discharges (V2G) outside Evening Peak, even when it could.
  6. The commute deduction fires exactly once, at departure, clamped at zero.
  7. *(bonus)* A sensitivity-matrix cell matches calling the engine directly
     with equivalent inputs — proving the 63-cell sweep isn't secretly running
     different math than the main engine.
- `npm run build` — confirmed the new `lib/` files type-check cleanly against
  the rest of the (still UI-less) project.

## What's next

Phase 3 builds the Zustand store and every sidebar control, wiring real
slider input into this engine for the first time — see
[phase-3-store-and-sidebar.md](phase-3-store-and-sidebar.md).
