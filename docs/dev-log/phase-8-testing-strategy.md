# Phase 8 — Testing Strategy

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Every earlier phase in this log describes building something new. This one
is different: most of the work here is documentation — a plain-language
walkthrough of the test suite that already exists, written for someone who
can code but hasn't necessarily written or read automated tests before. The
companion file, [`test-recommendations.md`](test-recommendations.md), covers
what's still missing and how to prioritize adding it.

Before writing that walkthrough, though, this phase also made two small, low-
risk additions to the test suite itself: a new `lib/__tests__/format.test.ts`
file (`lib/format.ts` had zero tests before this), and two new tests in
`lib/__tests__/v2g-simulation.test.ts` that turn a real finding recorded only
as prose in [phase-6-sensitivity-matrix.md](phase-6-sensitivity-matrix.md)
into a permanent regression test. Both were done first, specifically so this
document describes the suite as it actually is today, rather than describing
a "before" state that would go stale the moment someone reads it.

## Vocabulary primer

A few terms come up repeatedly below. Each is defined once here, in plain
language, before any individual test is discussed.

- **Unit test** — a small, automated check that one specific piece of code
  (here, one function) does the right thing for a specific input. "Unit"
  means it's testing one small unit of the program in isolation, not the
  whole app end to end.
- **Test runner** — the program that actually finds, executes, and reports on
  a project's tests. This project uses **Vitest**, which is what runs when
  you type `npm test`.
- **`describe` / `test` blocks** — Vitest's way of organizing tests.
  `describe("some group name", () => { ... })` is just a labeled container;
  `test("some specific behavior", () => { ... })` is one individual check
  inside it. Both files in this project use one `describe` block each,
  containing several `test` blocks.
- **Assertion** — the actual "check" inside a test, written with `expect(...)`.
  `expect(actualValue).toBe(expectedValue)` means "fail this test, loudly, if
  `actualValue` doesn't equal `expectedValue`." A single `test(...)` can (and
  often does) contain several assertions — see the "stationary battery never
  discharges below its reserve floor" test below for why that's useful.
- **`toBeCloseTo` vs. `toBe`** — `toBe` checks for *exact* equality; `toBeCloseTo`
  checks "close enough, within N decimal places." Most of this suite's
  numeric assertions use `toBeCloseTo` rather than `toBe`, because the values
  being compared come from repeated floating-point addition, subtraction, and
  division (kWh added up hour by hour, percentages divided from kWh amounts,
  and so on). JavaScript's floating-point math can leave tiny rounding
  artifacts behind — e.g. an amount that should mathematically be exactly
  `8.65` might actually come out as `8.650000000000001` after enough
  arithmetic — so demanding bit-for-bit equality would make tests fail for
  reasons that have nothing to do with an actual bug. `toBeCloseTo(x, 6)`
  means "within 6 decimal places of `x`," which is far tighter than the app
  ever needs to display but loose enough to absorb that floating-point noise.
- **Fixture vs. real data** — a "fixture" is invented test data made up just
  to exercise some code path. This suite deliberately uses neither invented
  numbers nor a separate small test-only JSON file — it imports the exact
  same `data/*.json` files the real app ships with, via `lib/reference-data.ts`.
  That matters most for the very first test in the suite, which hand-computes
  an expected electricity bill directly from the real household load and
  tariff numbers and checks the engine agrees — a fixture with invented,
  "nice round" numbers wouldn't prove the engine handles the app's *actual*
  data correctly, only that it can handle whatever numbers a test author
  happened to invent.
- **Regression / regression test** — a "regression" is a bug where something
  that used to work correctly stops working, usually as an unintended side
  effect of an unrelated change. A "regression test" is a test written
  specifically to catch that class of problem — it encodes "this behavior is
  correct, right now, on purpose" so that if a later change accidentally
  breaks it, the test suite turns red immediately instead of the bug being
  discovered later (or never). The phrase shows up literally in this suite's
  own comments (see the "bonus regression guard" test below), and this
  phase's two new tests are a second, concrete example of the same idea.
- **Mocking** — in a lot of test suites, "mocking" means faking out some
  external dependency (a network call, a database, the current time, a
  browser API) so a test can run quickly and predictably without that real
  dependency being available. This suite doesn't use mocking anywhere,
  because there's nothing external to fake: `lib/v2g-simulation.ts` and
  `lib/format.ts` are both plain, pure TypeScript functions — no network, no
  database, no browser, not even a system clock. Given the same inputs, they
  always produce the same outputs, which is exactly what makes them
  straightforward to test directly with real function calls.
- **Coverage** — "test coverage" describes how much of a codebase is actually
  exercised by automated tests, as opposed to only ever being checked by
  hand. Being honest about it here: as of this phase, everything in `lib/`
  has tests (the simulation engine and the formatting helpers). Everything
  else in the app — the Zustand store, both `hooks/` files, and all 20 files
  under `components/` — still has zero automated coverage. See "What these
  tests still do not cover" below, and `test-recommendations.md` for the
  prioritized plan to close that gap.

## How to run them

```
npm test
```

This runs `vitest run` (see `package.json`'s `scripts.test`). A fully-passing
run prints one line per test file with a checkmark, then a summary — running
it for this phase's final suite prints:

```
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

A **failing** test doesn't just print a red X — Vitest prints a diff between
what the assertion expected and what it actually got (e.g. `Expected: "N/A"`
vs. `Received: "null"`), plus the exact file and line number of the failing
`expect(...)` call, so there's no guesswork about which check failed or why.

One real trap worth knowing about: `vitest.config.mts` restricts test
discovery to files matching `lib/**/__tests__/**/*.test.ts` (see that file's
own header comment, added back in Phase 2). A test file placed anywhere else
— `components/__tests__/`, `store/tests/`, a stray `*.spec.ts`, anything
outside that exact pattern — will simply never run under `npm test`, with no
warning that it was skipped. It won't error; it will just silently not exist
as far as the test runner is concerned. This is exactly why `store/` and
`hooks/` have zero coverage today even though they're straightforward to
test in principle — adding a test file for them also means widening this
`include` pattern, which `test-recommendations.md` covers.

## Where the tests live

Two files, matching the `include` pattern above:

- `lib/__tests__/v2g-simulation.test.ts` — one `describe` block, now **9
  tests** (the original 7 from Phase 2, plus 2 new ones added in this phase).
- `lib/__tests__/format.test.ts` — new in this phase, one `describe` block,
  **16 tests** covering every exported function in `lib/format.ts`.

## The simulation engine tests (`v2g-simulation.test.ts`)

### `test("baseline scenario (no equipment) matches a manually-computed grid-only bill")`

This protects the number behind every savings claim the app makes. The
Executive Summary's "Annual Tariff Savings" card is only meaningful if the
"no equipment" baseline it's compared against is actually correct — if that
baseline were subtly wrong, every savings figure downstream would be wrong
too, in a way that wouldn't show up as a crash or an obviously broken number.

The test hand-computes what a plain grid-only household would pay — looping
over each of the 24 hours in the *real* `data/household_load.json` and
`data/tou_tariff.json` files, multiplying that hour's demand by that hour's
import rate, and adding the tariff's flat daily supply charge — entirely
independently of the engine itself. It then calls
`computeBaselineScenario()` and asserts the engine's result matches, using
`toBeCloseTo(expectedCost, 6)` (an **assertion**: it doesn't just print the
two numbers side by side, it fails the whole test run loudly if they differ
by more than a millionth of a dollar). Because `DEFAULT_SIMULATION_INPUTS.load.dailyKwh`
happens to exactly match the reference data's own daily total, the scaling
ratio in this specific case is 1 — the demand curve isn't being stretched or
shrunk — which is what makes a fully independent hand-computation possible
and exact here, rather than needing to reimplement the scaling formula too.
Ties to design-document.md **Locked decision #7** (the baseline reuses the real
dispatch function rather than a second, hand-written cost formula).

### `test("midday solar surplus charges the stationary battery with zero grid import")`

This protects the first two steps of the app's 7-step dispatch order:
solar covers home load first, then leftover ("surplus") solar charges the
stationary battery. The test picks hour 9 (9am) specifically because it's a
real surplus hour in the reference data — solar generation (3.40kW) genuinely
exceeds demand (0.80kW) that hour, not an invented scenario — and gives the
battery a large, mostly-empty capacity (30kWh, starting at 0%) so it can
never hit a capacity or rate-limit ceiling that would obscure what's being
tested. It asserts `gridImportKw` is (approximately) zero that hour, and that
the battery's charge level rose by *exactly* the surplus amount between hour
8 and hour 9. Ties to design-document.md **Locked decision #3** (dispatch priority
order).

### `test("stationary battery never discharges below its reserve floor in normal operation")`

This protects the Reserve SoC slider's most basic promise during everyday
(non-outage) use: whatever floor the user sets, the battery should never be
allowed to discharge below it, even during the most expensive Evening Peak
hours when the temptation to keep discharging is highest. The test loops
over all 24 `hourlyStates` the engine returns and calls
`expect(hourState.stationarySocKwh).toBeGreaterThanOrEqual(...)` on every
single one — this is a good example of one `test(...)` containing many
`expect(...)` calls, since the property being checked ("never below the
floor") only really means something if it's true for *every* hour, not just
one. A second assertion below that loop checks the test is actually
exercising real discharge behavior during Evening Peak (not trivially
passing because the battery just never tried to discharge at all) — without
that second check, a battery that never discharged *at all* would also
"pass" the floor check, for the wrong reason. Ties to design-document.md **Locked
decision #4** (Reserve SoC as a normal-operation floor).

### `test("EV contributes zero resilience when it's away at the moment the blackout starts")`

This protects one of the outage simulator's more surprising rules: the EV's
plugged-in status is frozen at the exact instant a blackout begins, so if
it's away being driven right when the power goes out, it contributes nothing
to survival time — even though it might come home (and normally would be
available to help) later that same day. The test sets up a commute schedule
that's away at midnight (departs 10pm, returns 6am) and starts the blackout
at hour 0, then asserts the "combined" (stationary + EV) and "stationary-only"
survival numbers are identical — proving the EV genuinely added nothing.
Ties to design-document.md **Locked decision #6** (outage rules).

### `test("EV never discharges (V2G) outside Evening Peak hours")`

This protects a specific, easy-to-get-backwards rule in step 6 of the
dispatch order: V2G (the EV feeding power back into the house) is only
allowed during Evening Peak hours, never any other time of day, even if the
EV is plugged in, well-charged, and there's unmet demand that it technically
could cover. The test removes the stationary battery entirely (so it can't
"absorb" the unmet demand and mask what's being tested), then checks
midnight specifically — an Off-Peak hour where the EV is plugged in by
default — and asserts `evDischargeKw` is zero and the entirety of that
hour's unmet demand instead shows up as a grid import. Ties to design-document.md
**Locked decision #3** (dispatch priority order, the V2G-during-Evening-Peak-
only step specifically).

### `test("commute energy is deducted exactly once, at departure, and clamped at zero")`

This protects the EV's daily commute deduction — a single lump subtraction
that has to happen exactly once, at the departure hour, and never push the
EV's charge negative. The test starts the EV with *exactly* enough charge
for one commute, so departure should bring it to precisely zero — a
deliberately tight setup that would catch the deduction firing twice (it
would go negative, then get clamped, silently masking the bug) or not firing
at all (it would stay positive). It checks the charge right before departure
(still at the starting amount), right at departure (zero), and then loops
over every remaining hour of the day confirming it's never negative anywhere
else — ruling out the deduction being incorrectly reapplied later. Ties to
design-document.md **Locked decision #5** (EV commute mechanics).

### `test("a zero-battery sensitivity matrix cell matches calling the engine directly")`

The suite's own comment literally calls this a "bonus regression guard" —
Phase 2 added it beyond the 6 tests the original plan called for, and it's
the clearest place in this suite to fully explain what that phrase means. A
**regression test** exists to lock in "this is correct, on purpose, right
now" so a later change can't silently break it without the test suite
noticing. Here specifically: `runSensitivityMatrix()` (which powers the
Sensitivity Matrix Table, sweeping 63 cells) re-implements none of the
engine's math itself — every cell just calls the same functions
(`scaleReferenceData`, `runHourlyDispatch`, `computeBaselineScenario`,
`computeFinancials`, `runOutageSimulation`) that the main, single-scenario
path uses. This test proves that by construction: it asks the matrix for
just one cell (reserveSocPct=0, stationaryCapacityKwh=0 — "no stationary
battery at all") and calls `runFullSimulation()` directly with the
equivalent inputs, then asserts the payback figure, survival hours, and the
"exhausted" flag all match exactly. If a future change ever gave the matrix
sweep its own slightly-different copy of this math — even a well-intentioned
optimization — this test would catch the two paths disagreeing immediately.
Ties to design-document.md **Locked decision #8** (sensitivity matrix axes), read
through the lens of Phase 2's own regression-guard reasoning above.

### The two new regression tests (this phase)

Both of these turn a real finding from
[phase-6-sensitivity-matrix.md](phase-6-sensitivity-matrix.md) — recorded
there only as prose under "Problems encountered & how I fixed them" — into
permanent, automated checks. That dev-log entry describes discovering, while
visually testing the Sensitivity Matrix Table, that the Survival Hours view
renders as a single flat color under default settings, and tracing that back
to a genuine (not a bug) property of the engine: the stationary battery is
always allowed to drain to 0% during a simulated outage, so its Reserve SoC
setting has literally zero effect on how long it lasts in a blackout — only
Stationary Capacity does. This is exactly the kind of thing a future
contributor, staring at a flat-colored matrix and having never read that
dev-log entry, could plausibly "fix" by mistake, breaking design-document.md **Locked
decision #4** in the process. Writing it as prose in a dev-log entry records
*that it was found*; writing it as a test is what actually stops it from
regressing silently. This is the same idea as the "bonus regression guard"
test above, with a second, concrete example: a decision that already exists
and is already believed to be correct, turned into an automated tripwire
rather than left as something only a human reading old notes would catch.

`test("Reserve SoC has zero effect on outage survival hours (locks in a Phase 6 finding)")`
builds two otherwise-identical scenarios differing only in
`battery.reserveSocPct` (10% vs. 70%), runs `runFullSimulation()` on both,
and asserts the resulting `outageCombined.survivalHours` and
`outageStationaryOnly.survivalHours` are equal. Getting a clean, honest
comparison here took some care: this app's normal rule (design-document.md **Locked
decision #10**) is that `battery.startingSocPct` defaults to matching
`reserveSocPct`, and `runSensitivityMatrix()` follows that same rule per row
— but if this test let the two scenarios' *starting* charge differ too, any
difference in survival hours could just be a side effect of starting the day
with a different charge level, not proof that the outage-time floor itself
is reserve-independent. So both scenarios pin `startingSocPct` to the same
fixed 90%, and `blackoutStartHour` to 0 (rather than the usual 6pm default)
so only a single hour of ordinary dispatch — hour 0, where the reference
data shows 0kW of solar against a small 0.35kW of demand — runs before the
blackout state gets captured; that demand is small enough that neither
reserve floor (1kWh or 7kWh, against a 9kWh starting charge on a 10kWh
battery) is ever actually reached. The test explicitly asserts the two
scenarios really do enter the blackout at the same charge level (8.65kWh in
both, confirmed by running the actual computation) before comparing survival
hours — otherwise a match wouldn't prove anything about the reserve floor
specifically. Ties to design-document.md **Locked decision #4** again, as a direct
confirmation of "the stationary battery always drains to 0% in an outage
regardless of reserve."

`test("every reserveSocPct row of a sensitivity matrix column has identical Survival Hours (locks in a Phase 6 finding)")`
checks the same underlying fact at the level the Sensitivity Matrix Table
actually displays it: calling `runSensitivityMatrix()` with three
`reserveSocPct` rows (0, 40, 80 — the low, middle, and high end of the
slider's 0-80% range) against a single, fixed 10kWh capacity column, then
asserting every cell in that one column reports the same
`survivalHoursCombined`. Running the real computation for this exact setup
gives 168 hours (the simulation cap, not exhausted) for all three rows —
matching the dev-log's own account of the default EV alone being enough to
cover a full simulated week regardless of the stationary battery's reserve
setting.

## The formatting helper tests (`format.test.ts`)

Every number the user actually sees on screen — a dollar figure, a payback
period, a survival-hours reading, a percentage, an hour-of-day label — passes
through one of the seven functions in `lib/format.ts` on its way there. These
tests group naturally by function rather than by design-document.md decision, since
formatting logic doesn't carry the same "why does the app behave this way"
weight the engine's dispatch rules do — but that doesn't mean it's not worth
testing.

- **`formatAud`** — one test for a normal positive amount (`1234.5` →
  `"$1,234.50"`), one for a negative amount (`-500.25` → `"-$500.25"`,
  confirming a scenario that costs money rather than saves it still renders
  with a sensible minus sign rather than something broken).
- **`formatPaybackYears`** — `null` (what `computeFinancials()` returns when
  a scenario never pays for itself, per design-document.md #9) must render as exactly
  `"N/A"`, never `"null"` or `"NaN"`. A normal number renders to one decimal
  place — the test uses `10.14`, the exact figure from Phase 3's dev-log
  entry about the Reserve SoC slider's effect on payback, which conveniently
  double-checks that real historical number formats the way that entry says
  it did (`"10.1 yrs"`).
- **`formatSurvivalHours`** — this one gets three tests specifically because
  it has two genuinely different branches (`exhausted: true` vs. `false`),
  and a seemingly simple one-line conditional like this is exactly the kind
  of thing that's invisible during a manual click-through (nobody manually
  clicks through both branches of every formatter on every release) but
  trivial to accidentally break in a refactor — e.g. swapping which branch
  uses `Math.floor()` vs. `toFixed(1)`, or inverting the `exhausted` check,
  would silently start showing false precision ("168.4+h", implying the
  simulation knows something it doesn't) or drop real precision ("14h"
  instead of "14.5h") without anything crashing. One test confirms the
  `exhausted: false` branch always uses `Math.floor()` regardless of the
  input's fractional part (`168.4` and `168.9` both render as `"168+h"`,
  since the simulation hit its safety cap and genuinely doesn't know the
  exact number). Two more cover both sides of the `exhausted: true` branch's
  own internal `Number.isInteger()` check: a whole number (`168` → `"168h"`,
  no decimal) and a fractional one (`14.5` → `"14.5h"`).
- **`formatPercent`** — one normal value, and one value ending in exactly
  `.5` (`2.5` → `"3%"`) to pin down that `Math.round()` in JavaScript always
  rounds a tie up (toward +Infinity), not to the nearest even number the way
  some other languages' rounding functions do — a detail that would be easy
  to get subtly wrong if this function were ever rewritten by hand instead of
  using the built-in.
- **`formatHour` and `formatHourShort`** — three hours each: hour `0`
  (midnight, the trickiest edge case in a 12-hour clock, since it has to
  display as "12", not "0", via the `hour % 12 === 0 ? 12 : ...` branch, and
  it's AM), hour `12` (noon — the exact same branch, but on the PM side,
  confirming it's genuinely shared rather than midnight being special-cased
  separately), and an ordinary hour like `18` (`"6:00 PM"` / `"6pm"`) to
  confirm the non-edge-case path.
- **`formatHoursDelta`** — one test confirming a positive input always
  renders with a leading `"+"`. The function's own source comment argues
  this value is "non-negative by construction" elsewhere in the app (the EV
  can only ever add survival time versus the stationary-only baseline, never
  subtract from it) — but that's a claim about how the rest of the app calls
  this function, not something the formatting function itself enforces, so
  this test only checks the formatting logic in isolation.

## What these tests still do not cover

This list is deliberately shorter than it would have been before this phase
— `lib/format.ts` and both Phase 6 findings moved from "gap" to "covered"
here. What's left, at a category level:

- `store/useSimulationStore.ts` — every setter, `applyPreset()`, and
  `resetToDefaults()` have zero automated tests.
- `hooks/useSimulationResult.ts` and `hooks/useSensitivityMatrix.ts` — zero
  automated tests.
- All 20 files under `components/` — zero automated tests.

See `test-recommendations.md` in this same folder for the prioritized list
of what to add next, plus a reusable manual QA checklist distilled from what
Phases 3–7 already did by hand.

## Verification

- `npm test` — **25 passed (25)** across 2 test files (9 in
  `v2g-simulation.test.ts`, 16 in the new `format.test.ts`).
- `npm run build` — clean compile and type-check, confirming the new test
  files themselves are valid TypeScript (Next's build type-checks everything
  under the project, test files included).

This phase's Verification is a different kind than every phase before it.
Phases 1–7 each confirmed either "the new feature works" or "nothing broke
while building the new feature." This phase confirms something one level
removed from that: that the new *safety-net* code — the tests themselves —
is itself correct. A test with a wrong assertion would still show up as
"passing," just proving the wrong thing, so getting the exact expected
values right (by hand-computing them or running the real engine, not
guessing) mattered as much here as it does in the app code the tests are
protecting.

## What's next

See [`test-recommendations.md`](test-recommendations.md) for the prioritized
list of what to test next (starting with the Zustand store, which needs no
new dependency — only a small `vitest.config.mts` change) and a manual QA
checklist distilled from what Phases 3–7 already verified by hand.
