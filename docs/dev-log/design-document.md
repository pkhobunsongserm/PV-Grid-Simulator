# Resilience vs. ROI Microgrid Sensitivity Matrix (V2G Edition)

A Next.js dashboard that simulates a household's solar + stationary battery +
bidirectional-EV (V2G — "Vehicle-to-Grid," the EV can send power *back* into the house,
not just draw power from it) microgrid against a real Melbourne time-of-use tariff, and
reports financial payback, annual savings, and blackout-survival hours — plus a
sensitivity matrix showing how battery reserve level and size trade off payback vs.
resilience.

**Read this file before making any change to the simulation logic.** It records every
engineering decision that was deliberately made during planning — if a change seems to
require revisiting one of these, say so explicitly rather than quietly overriding it.

This project is being built incrementally with Claude Code. If you're picking this repo
up in a new session (human or AI), start here.

## What this app actually is

There's no backend, database, or login. Every calculation — the 24-hour simulation, the
financial numbers, the sensitivity matrix — runs entirely in the visitor's browser,
recalculated live as sliders move. The three files in `data/` are the only "data" this
app has; everything else is derived from them plus whatever the sliders are set to.

## Tech stack

- **Next.js 14 (App Router) + TypeScript + Tailwind CSS** — a client-side single-page
  app hosted by Next's tooling. No server-rendering of dynamic data happens anywhere;
  components are marked `"use client"` where needed.
- **Recharts** — for the Dual-Battery Stack Chart (a standard chart type it's built
  for).
- **Zustand** — holds the ~15 interdependent slider inputs (battery, EV, solar, load,
  cost-assumption settings). Chosen over React's built-in Context because Context
  re-renders every subscriber on every change, which would make every result
  component (Executive Cards, the battery chart, the flow diagram, the sensitivity
  table) redraw on every pixel of a slider drag; Zustand's selector subscriptions
  avoid that.
- **Vitest** — unit tests for the simulation engine, run independently of the UI.
- **Lucide React** — icon set (used in the sidebar and the Energy Flow Diagram).
- The Energy Flow Diagram is **hand-built SVG**, not a charting/diagram library — its
  shape never changes (always the same 5 nodes: Solar, Home, Stationary Battery, EV,
  Grid), so a general-purpose flow/Sankey library would add a dependency for no real
  benefit over drawing 5 boxes and some connector lines directly.

## Project structure and the "why"

```
data/            The 3 reference JSON files, unmodified from source.
lib/             Pure calculation code — NO React/UI imports anywhere in here.
                 This is what makes the model logic "cleanly isolated": these files
                 can be read, tested, and understood with zero knowledge of React.
  types.ts         TypeScript shapes for every piece of data in the app.
  constants.ts     Capex defaults, rate limits.
  v2g-simulation.ts  The simulation engine itself (see below).
  presets.ts       "Commuter EV" / "Off-Grid Heavy" / "Solar Max" preset definitions.
  format.ts        Small display-formatting helpers.
  reference-data.ts  The three JSON files, imported and typed ONCE — everything else
                   that needs them imports from here instead of re-importing the JSON.
  __tests__/       Vitest unit tests for the engine.
store/           Zustand store — holds raw slider values ONLY, never computed results.
hooks/           useMemo-based glue that recalculates results from the store by
                 calling lib/v2g-simulation.ts whenever a relevant input changes.
components/
  layout/          Header, Sidebar shell.
  controls/        The actual slider/input UI pieces.
  results/         Executive cards, charts, the flow diagram, the sensitivity table.
app/             Next.js's required entry-point files (layout, page, global styles).
docs/dev-log/    Phase-by-phase development diary (documentation only — see its own
                 README for why this can't affect the app; not part of the running code).
```

**The sliders are the single source of truth.** Nothing computed is ever stored twice
in two places that could drift out of sync — every chart and card is a live view of a
fresh calculation off the current slider values.

## Locked decisions — read before touching the simulation logic

### 1. Tariff data source
The tariff schedule in `data/tou_tariff.json` (24 hourly entries, 4 named periods —
Off-Peak, Solar Sponge, Evening Peak) is the canonical source of tariff rates. It is
**not user-editable** in this version — no UI exists to change rates or period
boundaries. An earlier draft of the feature list described a simpler 3-tier tariff with
different numbers; that draft was superseded by this file.

### 2. Scaling the reference solar/demand curves
`data/solar_profile.json` is shaped for a 6.6kW reference system; `data/household_load.
json` totals 18.2kWh/day. When the user changes the Solar Capacity or Base Load
sliders, the underlying hourly curves are scaled **proportionally**, preserving their
shape:

```
generation_kw[h] = pv_output_kw[h] × (selected_solar_kw / 6.6)
demand_kw[h]     = demand_kw[h]    × (selected_daily_kwh / 18.2)
```

The scaled generation curve is clipped to a scaled inverter limit
(`inverter_limit_kw × (selected_solar_kw / 6.6)`, i.e. the DC:AC ratio from the
reference system — about 1.32:1 — is assumed to hold at any size, rather than exposing
inverter size as its own separate slider). This is a stated MVP simplification, not an
oversight — surface it in a tooltip near the Solar Capacity slider.

**Critical load** (the ~30% of demand that matters during a blackout): by default, the
per-hour `critical_demand_kw` values from the JSON are scaled by the same load ratio,
preserving their original hour-to-hour shape. If the user overrides the Critical Load %
slider, the app switches to a flat formula instead — `critical_demand_kw[h] =
demand_kw[h] × criticalLoadPct` for every hour — which deliberately replaces the JSON's
slight per-hour variation. Both paths are intentional; don't quietly pick one.

Neither scaling formula can divide by zero: both denominators (6.6, 18.2) are fixed
reference constants, never user-controlled values.

### 3. Dispatch priority order (the core algorithm)
Every simulated hour, in this exact order:

1. Solar → home load, direct.
2. Solar surplus → stationary battery charge (≤10kW rate, ≤capacity).
3. Remaining solar surplus → EV charge, if plugged in (≤charger power, ≤capacity); any
   charging room solar doesn't fill is then topped up from the grid, the same hour (see
   the Phase 9 changelog entry — this is a deliberate, later exception, not part of the
   original MVP simplification below).
4. Remaining solar surplus → export to grid.
5. Unmet demand → stationary battery discharge, **any period**, as long as its SoC is
   above the Reserve floor.
6. Remaining unmet demand, **Evening Peak hours only** → EV V2G discharge, if plugged
   in and above its floor.
7. Remaining unmet demand → grid import.

**MVP simplification, stated on purpose (stationary battery only — see the Phase 9
changelog entry for the EV's later exception)**: the stationary battery never charges
from the grid, even during cheap Solar-Sponge/Off-Peak hours — only from solar surplus.
This is what makes step 5's "discharge any time it beats an import" rule safe for THAT
battery: since all its stored energy is free (solar-origin), there's never a case where
holding it back would have been better. The EV no longer shares this guarantee (it can
hold grid-bought energy), but step 6's V2G discharge stays economically harmless even
so: with no round-trip efficiency loss modeled, buying a kWh at Evening Peak in step 3
and discharging that same kWh back to the house later in that same Evening Peak window
(step 6) nets to exactly zero, never a loss — just possibly a redundant-looking pair of
flows in the same hour's trace, not a financial bug.

### 4. Reserve SoC vs. EV Discharge Floor — intentionally asymmetric
These are two different sliders governing two different batteries, and they behave
differently on purpose:

- **Stationary Reserve SoC** is a floor *only during normal, non-outage operation*.
  Its entire purpose is to guarantee energy is available *for* an outage — so during a
  simulated blackout, the stationary battery is allowed to discharge all the way to 0%
  (the reserve is exactly what's being drawn on).
- **EV Discharge Floor** stays a hard floor *even during* a simulated blackout, because
  its purpose (keeping enough charge to actually drive away) doesn't stop mattering
  just because the grid is down.

Label these distinctly in the UI (e.g. "Stationary Reserve SoC" vs. "EV Discharge
Floor") — they are not the same kind of setting and shouldn't be presented as
equivalent.

### 5. EV away/commute mechanics
- `isEvAway(hour, departureHour, arrivalHour)` determines whether the EV is home and
  available for dispatch. It correctly handles schedules that cross midnight (e.g.
  departs 22:00, arrives 06:00) via modular arithmetic. If `departureHour ===
  arrivalHour`, that's treated as "EV never home," not an error.
- The daily commute energy (a single lump number, e.g. 12kWh) is subtracted from the EV
  battery **exactly once**, at the departure hour, before that hour's other dispatch
  math runs — clamped at 0, never negative. It represents the full round trip; outbound
  and return legs are not modeled separately.

### 6. Outage / resilience simulator
From a configurable blackout-start hour (default **06:00**, deliberately BEFORE the
day's solar has had a chance to recharge the stationary battery — see the Phase 9
changelog entry for why this superseded the original 18:00/"highest demand" default):
- Only **critical** load is served, not full demand.
- No grid import/export is available at all during the simulated outage.
- No solar recharging is assumed during the outage (a deliberately conservative
  choice).
- Stationary battery contributes its full charge down to 0% (see decision 4).
- EV contributes charge above its discharge floor **only if it happens to be plugged in
  at the moment the blackout starts** — its plugged/away status is frozen at that
  instant for the rest of the simulated outage (no commute cycling modeled mid-outage).
- The simulation is capped at 168 hours (one week); if it never runs out, display
  "168+" rather than an unbounded number.
- Run twice per scenario (`includeEV: true/false`) to produce the Executive Card's
  "combined vs. stationary-only" comparison.

### 7. Baseline scenario (for savings calculations)
The "no equipment" baseline used to compute savings is produced by calling the *same*
dispatch function with battery capacity and solar capacity set to 0 and the EV
permanently away — not a separately-written formula. This guarantees the baseline can
never quietly disagree with the real simulation about how a dollar of cost is
calculated, and is the basis of the first unit test.

### 8. Sensitivity matrix axes
The matrix varies **Reserve SoC%** (rows) against **Stationary Battery Capacity**
(columns) only — **not** EV capacity, which stays fixed at whatever the user
configured, because the EV is treated as a car someone already owns, not a sizing
decision like a home battery purchase. Column headers display the resulting combined
total (`stationary + EV capacity`) for context only.

### 9. Capex / financial assumptions (no cost inputs existed in the original spec)
- Battery: **$900/kWh**
- Solar: **$1,200/kW**
- V2G charger: **$10,000 flat** — a fixed cost, not scaled by power rating, because
  real bidirectional charger cost is dominated by fixed inverter/certification cost,
  not size.
- The EV itself is **not** capitalized — treated as a pre-existing transport asset;
  only the incremental V2G-capable charger counts as this project's investment.
- `annualSavings = dailySavings × 365`, extrapolated from one representative day — a
  real simplification (no seasonal/weekday variation modeled). Show a small disclaimer
  near the payback number rather than presenting it as a precise forecast.
- `paybackYears = totalCapex / annualSavings`, or `null` ("N/A") if `annualSavings <=
  0` — guards the obvious divide-by-zero/negative case.

### 10. Starting SoC (not in the original spec — added because the engine needs it)
- `battery.startingSocPct` defaults to Reserve SoC (the battery starts each simulated
  day sitting at its own floor — a reasonable steady-state assumption).
- `ev.startingSocPct` defaults to 80% (a typical "charged overnight" starting point).

### 11. Units
Because the data is hourly (`resolution_minutes: 60`), a rate of 1kW sustained for 1
hour equals exactly 1kWh — so kW and kWh are numerically interchangeable throughout
this MVP's math. That's a property of using hourly data, not a general truth, so the
code threads an explicit `dt = 1` (hour) multiplier through every energy accumulation.
If resolution ever changes (e.g. to 15-minute steps), that should be a one-line change,
not a silent unit bug — don't remove the `dt` multiplier to "simplify" the code.

### 12. EV Max Charge Cap (not in the original spec — added post-launch)
- `ev.chargeCapPct` (50-100%, default 80%) mirrors a real EV owner's own charge-limit
  setting — a ceiling the EV is never charged above, from solar OR the grid, at any hour
  of the day, including recharging after a V2G discharge. It's a separate slider from
  Starting Charge (#10) and Discharge Floor (#4/#5) — three independent lines on the
  same 0-100% scale (floor ≤ starting/current SoC ≤ cap), not one setting reused three
  ways.
- The cap only ever limits future charging — it never retroactively pulls the EV's SoC
  down. If Starting Charge is set above the cap, the EV simply won't charge any higher
  until normal discharge (commute, V2G) brings it back under the cap on its own.
- The `off-grid-heavy` preset explicitly overrides this to 100% (see `lib/presets.ts`)
  — that preset's whole purpose is maximizing blackout backup energy, which the
  app-wide 80% default would otherwise quietly work against.

### 13. V2G vs. normal charger toggle (not in the original spec — added post-launch)
- `ev.v2gEnabled` (default **true**) gates whether the EV's charger is bidirectional.
  Charging behavior (Steps 2-3 of decision #3) is **completely unaffected** either
  way — this only gates *discharge*: Step 6's Evening Peak V2G discharge (decision
  #3) and the outage simulator's EV contribution (decision #6) both require
  `v2gEnabled: true`, in addition to their existing gates (period, plugged-in
  status, floor).
- Confirmed as a real hardware constraint, not a policy choice: a standard
  unidirectional charger has no physical path to push power backward, so this
  applies with NO exceptions — even a simulated blackout doesn't relax it, unlike
  the EV's Discharge Floor (decision #4), which is a chosen buffer, not a hardware
  limit.
- `capex.normalChargerFixedCost` (default **$2,150**, AU 2026 market research:
  hardware $700-$1,500 + install $1,000-$1,500, total installed range
  $1,500-$5,000) replaces `v2gChargerFixedCost` ($10,000, unchanged) in
  `computeFinancials()`'s `totalCapex` whenever `v2gEnabled` is false — same
  `ownsEv` gate as before (a household with no EV buys neither).
- The Sensitivity Matrix needed **zero code changes** — `runSensitivityMatrix()`
  already threads `inputs.ev`/`inputs.capex` through every cell untouched (only
  `battery.*` is overridden per-cell), so this global toggle propagates
  automatically, the same way `ownsEv` already does.

## Code documentation standard

This codebase is meant to be readable by someone who's comfortable with code but new to
Next.js/React/TypeScript/this specific stack. When adding or editing files:

- Every file starts with a short header comment explaining what it's for and, where
  relevant, why it lives where it does.
- Every exported function/type gets a plain-language comment — especially anywhere a
  decision from this README is being implemented, explain *why*, not just *what*, since
  those are the spots most likely to look "wrong" to someone unfamiliar with the
  reasoning above.
- Non-obvious individual lines (formulas, unit conversions, clamps/edge cases,
  hardcoded numbers) get a short inline comment. Not every line — just the ones that
  aren't self-explanatory.
- Config files get a one-line comment on anything non-default; no need to explain
  standard boilerplate.

## Running this project

```
npm run dev     # start the local dev server (usually http://localhost:3000)
npm test        # run the Vitest unit tests for the simulation engine
npm run build   # production build
npm run lint    # ESLint
```

## Prompting Claude Code on this repo

Start future sessions with something like:

> Read README.md first — don't re-litigate any of the locked decisions in it; if a
> change requires revisiting one, say so explicitly before writing code.
> `lib/v2g-simulation.ts` must stay framework-free (no React/UI imports) and
> test-covered — any change to dispatch behavior needs a matching test update in the
> same turn. Run `npm test` before and after any engine change, and show me the diff
> before touching UI components that consume `useSimulationResult()` or
> `useSensitivityMatrix()` (they feed every result component on the page, so a bug
> there is easy to miss).
> Follow the Code Documentation Standard above — I'm new to this stack.

## Changelog

Tracks decisions, additions, and deviations from the original feature spec made
**during implementation** — as opposed to "Locked decisions" above, which captures what
was decided during planning, before any code existed. Entries are grouped by phase,
newest first. For the full story behind any entry — what led to it, what was tried,
what broke — see the matching file in `docs/dev-log/`.

### Phase 11 — V2G vs. normal charger comparison

- **Added `EVConfig.v2gEnabled`** (default **true** — preserves all prior behavior
  unchanged) — a new toggle ("Enable V2G (bidirectional charging)" in EV & V2G
  Configuration) that models the real difference between a bidirectional and a
  standard one-way home charger: identical charging behavior either way, but
  `false` disables EV discharge entirely — both Step 6's Evening Peak V2G
  (decision #3) and the outage simulator's EV contribution (decision #6),
  confirmed as a genuine hardware limitation with no blackout exception, unlike
  the EV's own Discharge Floor.
- **Added `CapexConfig.normalChargerFixedCost`** (default **$2,150**, AU 2026
  market research: $1,500-$5,000 installed range, median ~$2,150 for a complete
  7kW unidirectional Level 2 charger) — `computeFinancials()` now picks between
  this and the existing `v2gChargerFixedCost` ($10,000, unchanged) based on
  `v2gEnabled`, same `ownsEv` gate as before.
- **No Sensitivity Matrix changes required** — `runSensitivityMatrix()` already
  spreads `inputs.ev`/`inputs.capex` through every cell unmodified (only
  `battery.*` is overridden per-cell), so `v2gEnabled` propagates automatically
  exactly like `ownsEv` already does; no new `SensitivityMatrixCell` fields
  needed.
- Updated `lib/assumptions.ts`: new `"ev-v2g-toggle"` entry, plus caveats added
  to `"reserve-floor"`, `"financials"`, and `"matrix"` noting the Discharge
  Floor's blackout-immunity, the charger cost choice, and the "+ EV" Survival
  Hours column can all depend on `v2gEnabled`.
- See Locked Decision #13 for the full reasoning.

### Phase 10 — EV grid-charging on arrival

- **The EV now charges from the grid, not just solar surplus** — a deliberate,
  explicitly-requested exception to decision #3's "no battery ever charges
  from the grid" rule, scoped to the EV only. Real-world motivation: an EV
  that arrives home in the evening (the app's own default schedule) was
  previously stuck at whatever charge it had left from its commute for the
  rest of the simulated day, since there's rarely leftover solar after
  sunset — which didn't match how anyone would actually use a home EV
  charger (plug in, it starts charging). Step 3 of the dispatch loop now
  tops up any charging room solar doesn't cover from the grid, immediately,
  the same hour — same as a real charger, not a smart/scheduled one that
  waits for a cheaper tariff period.
- **New `evGridChargeKw` field on `HourlyState`**, kept separate from
  `evChargeKw` (now solar-sourced only) rather than folding the grid draw
  into it, so the Energy Flow Diagram's "Solar → EV" arrow doesn't silently
  start claiming paid grid energy as free solar. A new "Grid → EV" flow was
  added alongside it, reusing Grid's existing neutral-gray color (same
  reasoning as the existing "Grid → Home" flow). `gridImportKw` keeps its
  original HOME-only meaning; `importCost` now sums both.
- **First cut was unconditional and broke the app's flagship number**: with
  the app's defaults (EV arrives 6pm, squarely inside Evening Peak — the
  tariff's most expensive period, $0.58/kWh), the EV needing a meaningful
  top-up on arrival flipped the default "Commuter EV" scenario from
  +$2,654.83/yr savings (10.1yr payback) to **‑$673.97/yr, payback N/A** —
  and every other preset's payback ballooned too. Real and intentional given
  the literal request, but severe enough on the app's core "does this pay
  for itself?" story that it needed a second pass rather than shipping as-is.
- **Added `EVConfig.avoidPeakGridCharging`** (default **true**) — a new
  toggle ("Avoid peak-price grid charging" in EV & V2G Configuration) so the
  EV still tops up from the grid the moment solar can't cover it, but WAITS
  out Evening Peak specifically before doing so, resuming the instant
  Off-Peak or Solar Sponge starts. Solar-sourced charging is never affected
  either way. With the default ON, the Commuter EV scenario now shows
  +$975.83/yr savings (27.6yr payback) — better than the unconditional
  version, but still genuinely lower than the pre-Phase-10 baseline, because
  the EV now reliably tops up in full every night (24kWh at Off-Peak's
  $0.22/kWh) instead of simply staying partially charged at no cost, which
  is what actually happened before this phase. That remaining gap is a real,
  correctly-modeled cost of "the EV always ends up full," not a pricing bug.
- **New `evGridChargeKw` field on `HourlyState`**, kept separate from
  `evChargeKw` (now solar-sourced only) rather than folding the grid draw
  into it, so the Energy Flow Diagram's "Solar → EV" arrow doesn't silently
  start claiming paid grid energy as free solar. A new "Grid → EV" flow was
  added alongside it, reusing Grid's existing neutral-gray color (same
  reasoning as the existing "Grid → Home" flow). `gridImportKw` keeps its
  original HOME-only meaning; `importCost` now sums both.
- **Cost consequence called out rather than hidden**: updated
  `lib/assumptions.ts`'s "no-grid-charging" entry (and the EV controls that
  link to it) to explain both the toggle and the underlying tradeoff,
  rather than leave the old "neither battery ever buys grid power" claim
  standing after it became false for the EV.
- **`lib/__tests__/v2g-simulation.test.ts`'s commute-deduction test
  (Test 6) needed rewriting**, not just re-running: it previously proved
  "nothing charges the EV before departure" by relying on there being no
  solar that early in the morning — an argument grid-charging invalidates
  for ANY plugged-in hour, not just post-arrival ones. Rewritten to start
  the EV already at 100% (no charging room available from either source) so
  the departure-deduction behavior it actually tests stays isolated from the
  charging mechanism entirely. New tests lock in: the EV grid-charging even
  at Evening Peak rates when the toggle is off; the EV deferring grid
  charging through Evening Peak and catching up right after when the toggle
  is on (the default); and that the stationary battery's own solar-only
  guarantee is unaffected either way.

### Phase 9 — In-app assumption disclosure + default blackout hour

- **Changed `DEFAULT_SIMULATION_INPUTS.blackoutStartHour` from 18:00 to
  06:00**, revisiting decision #6's original default. Real user feedback on
  the deployed app (a screenshot of the Sensitivity Matrix's "Battery Only"
  view, every Reserve SoC row visually identical) surfaced a compounding
  effect the Phase 6 changelog entry below didn't fully capture: Reserve SoC
  is a discharge floor only (decision #4), so with the *evening* default,
  ample midday solar surplus refilled the battery to nearly the same level
  every day regardless of its reserve setting, on top of decision #4's own
  "outage ignores reserve entirely" effect — two separate reasons compounding
  into a flat-looking matrix, only one of which was documented. Moving the
  default to 06:00 (before that day's solar has run) means the reserve floor
  IS what's sitting in the battery at blackout time, so the matrix now shows
  Reserve SoC's real, intuitive effect out of the box. **Decision #4 itself
  is unchanged** — the outage simulator still never reads `reserveSocPct`
  and still drains the stationary battery to 0% during a blackout; only the
  *default hour the app starts you at* moved, which is why the existing
  Phase 8 regression tests (which set their own explicit `blackoutStartHour`
  rather than relying on the default) needed no changes.
- **Added `lib/assumptions.ts`, `InfoLink`, and `AssumptionsPanel`** — every
  simplifying assumption listed under "Locked decisions" above is now
  surfaced in the running app itself (a "Why?" link next to the relevant
  slider/result, deep-linking into one "Assumptions & Methodology" panel at
  the bottom of the page), not just in this file. Several rendered UI strings
  had been pointing users at "see README.md" — a file the deployed app never
  ships — which is very likely what the user feedback above was reacting to
  as well.

### Phase 8 — Testing Strategy

- **Added `lib/__tests__/format.test.ts`**, not part of any earlier plan —
  `lib/format.ts` had zero test coverage even though every number the user
  sees on screen passes through one of its functions, so it was written to
  close that gap before documenting the test suite as if it were complete.
- **Added two regression tests to `lib/__tests__/v2g-simulation.test.ts`**
  that turn a real finding from `docs/dev-log/phase-6-sensitivity-matrix.md`
  — Reserve SoC has zero effect on outage Survival Hours — into permanent,
  automated checks, following the same precedent set by Phase 2's own extra
  "bonus" 7th test (an extra regression guard, not requested by the plan).
- See `docs/dev-log/phase-8-testing-strategy.md` for the full walkthrough of
  every test in the suite, and `docs/dev-log/test-recommendations.md` for
  what's still recommended but not yet built.

### Phase 7 — Presets and Polish

- **Fixed a real mobile layout bug**: `TimeSlider.tsx`'s range input was
  quietly forcing the whole page a few pixels wider than the viewport on
  narrow screens, because a flex item's default `min-width: auto` overrides
  `flex-1` unless explicitly cleared with `min-w-0`. Found by measuring
  `document.documentElement.scrollWidth` against `clientWidth`, not by eye —
  the page didn't visibly look broken.
- **Fixed a real accessibility gap**: the hour dropdowns' (`HourSelect.tsx`)
  visible labels were never actually linked to their `<select>` elements —
  fixed with `useId()` + matching `htmlFor`/`id`.
- **Added the input-validation guard the plan called for**: a visible
  warning when the EV's Departure and Arrival times are set to the same
  hour, since that's a legal, intentional configuration (README.md #5) but
  an easy one to hit by accident, with a consequence (EV never charges,
  discharges, or helps in a blackout) that's easy to misread as a bug
  without an explanation.
- **Three small README.md accuracy fixes** caught during this phase's
  read-through pass: the "5 result components" claim in two places was
  updated to match what's actually built (4: Executive Cards, the battery
  chart, the flow diagram, the sensitivity table), and `lib/reference-data.ts`
  (added in Phase 3) was missing from the Project Structure listing.

### Phase 6 — Sensitivity Matrix Table

- **Extended `SensitivityMatrixCell` with a `survivalHoursCombinedExhausted`
  flag**, not in the original type definition — the matrix was already
  computing this internally but not returning it, so the table couldn't
  distinguish "168 hours, exactly" from "168+, hit the simulation's cap" the
  way every other survival-hours display in the app can.
- **The heatmap color always encodes magnitude, never "good vs. bad."**
  Darker means "a bigger number" for both Payback Years (where bigger is
  worse) and Survival Hours (where bigger is better) — a ramp that flipped
  meaning per metric would be more confusing, not less.
- **Confirmed by testing, not a bug: Reserve SoC has zero effect on Survival
  Hours** — only Stationary Capacity does. This falls directly out of
  decision #4 above (the stationary battery always drains to 0% in an
  outage, regardless of its reserve setting), but seeing the matrix render
  as a flat, uniform color under default settings was a useful, if initially
  alarming-looking, confirmation that the engine matches the spec.

### Phase 5 — Energy Flow Diagram

- **Grid does not get its own categorical color in the diagram — it uses the
  same neutral gray as the "EV plugged in" band.** A flow is colored by
  whichever node sources it (Solar/Battery/EV/Grid = 4 possible identities),
  but this project's colorblind-safety validator confirmed no 4-color set
  passes the "any two marks might be neighbors" check that a diagram like
  this actually needs (two flows really can be visually adjacent in the same
  hour). At most 3 categorical hues can pass that check, so Grid — the
  fallback/utility source, not a sized "asset" like the other three — uses
  neutral gray instead.
- **Battery and EV reuse the exact same blue/orange from the Phase 4 chart**,
  rather than getting new colors for this diagram — color follows the
  entity across the whole app, not just within one chart.
- **The diagram defaults to showing noon**, not the visitor's real-world
  current time — using real time would make the server-rendered and
  client-rendered markup disagree (a hydration mismatch), since the server
  doesn't know the visitor's clock.

### Phase 4 — Executive Cards + Dual-Battery Chart

- **Dual-Battery Chart implemented as two lines, not a stacked area.** The original
  feature list named this component a "stack chart," but Stationary Battery SoC% and EV
  Battery SoC% don't sum to anything meaningful — they're two independent batteries
  sharing a 0–100% axis, not parts of one whole. A stacked area would have visually
  implied a "combined fullness" number that doesn't exist.
- **Added a table-view toggle to the chart** — not requested anywhere in the original
  spec. Added because a plain-table equivalent for every chart is a non-negotiable
  accessibility requirement under the data-visualization guidance this project follows,
  not an optional extra.
- **Added a dedicated, colorblind-validated chart color palette**
  (`--chart-series-1`/`--chart-series-2`/etc. in `app/globals.css`), kept separate from
  the sidebar's emerald accent color.
- **The "Combined Resilience Backup" card shows one headline value plus a delta line**,
  not two equally-weighted numbers. The spec's "Hours with EV vs. Stationary Only" was
  read as "how much does the EV help" — so the combined figure leads, and
  stationary-only appears as a smaller comparison line underneath.

### Phase 3 — Zustand Store and Sidebar Controls

- **Added `lib/reference-data.ts`**, a small module centralizing the three JSON imports,
  not listed in the original project structure — introduced so every later file that
  needs the reference data imports from one place instead of re-importing and
  re-casting the raw JSON itself.
- **No headless browser existed in the environment to visually verify the app.**
  Installing one (Playwright + Chromium) required working around missing system
  libraries without root access — downloading the specific `.deb` packages directly and
  pointing Chromium at them via `LD_LIBRARY_PATH`, rather than a normal `apt install`.
  This setup lives outside the repo and isn't saved anywhere, but it's what made real
  browser screenshots possible as verification from this phase onward.

### Phase 2 — Simulation Engine

- **`vitest.config.ts` was renamed to `vitest.config.mts`** after a module-loading error
  on the first test run — not a behavior change, just a required filename fix for this
  version of Vitest.
- **The test suite includes a 7th, "bonus" test** beyond the 6 specified in the plan,
  checking that a sensitivity-matrix cell's math matches calling the engine directly —
  an extra regression guard, not requested by the plan.

### Phase 1 — Scaffold, Data, and README

- **`README.md` was written in Phase 1, not deferred to the final polish phase** as the
  original phased build order specified — moved earlier at your request, so it would
  exist as a reference from the start of the repo rather than only being assembled at
  the end.
- **The npm package name differs from the repository folder name**
  (`pv-grid-simulator` vs. `PV-grid-simulator`) — npm package names can't contain
  capital letters, so the folder kept its name but `package.json`'s `"name"` field was
  set to the lowercase form.
