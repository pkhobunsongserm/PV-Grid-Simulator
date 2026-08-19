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
3. Remaining solar surplus → EV charge, if plugged in (≤charger power, ≤capacity).
4. Remaining solar surplus → export to grid.
5. Unmet demand → stationary battery discharge, **any period**, as long as its SoC is
   above the Reserve floor.
6. Remaining unmet demand, **Evening Peak hours only** → EV V2G discharge, if plugged
   in and above its floor.
7. Remaining unmet demand → grid import.

**MVP simplification, stated on purpose**: neither battery ever charges from the grid,
even during cheap Solar-Sponge/Off-Peak hours — only from solar surplus. This is what
makes step 5's "discharge any time it beats an import" rule safe: since all stored
energy is free (solar-origin), there's never a case where holding it back would have
been better. Adding grid-charging later (see Future Features, in the planning history)
would break that assumption and require a genuinely smarter dispatch rule, not just a
tweak.

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
From a configurable blackout-start hour (default **18:00**, the start of Evening Peak —
chosen because it's also when demand is highest, making it the more meaningful stress
test vs. midnight):
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
