# Test Recommendations

A companion to [`phase-8-testing-strategy.md`](phase-8-testing-strategy.md),
which walks through the automated test suite as it exists today — as of
that phase, **25 tests** across 2 files, covering everything in `lib/` (the
simulation engine and the display-formatting helpers) and nothing outside
it. This document is different in kind: it's not a diary entry describing
what was built in one sitting, it's a living reference to update as coverage
grows. It has two halves — new automated tests worth adding next, and a
manual QA checklist distilled from the real, ad hoc verification work
Phases 3 through 7 already did by hand, written down here so it's repeatable
instead of reinvented (and re-forgotten) every time.

## How these are prioritized

Three tiers, used consistently below:

- **P0** — high value, and nothing new needs installing to do it. Either it
  wasn't built in this pass purely because this session's scope was kept
  narrow, or it needs one small config change (not a new dependency).
- **P1** — valuable, but genuinely blocked on test infrastructure this
  project doesn't have installed yet (`jsdom`, `@testing-library/react`).
- **P2** — worth having eventually. Not urgent for the MVP.

## New automated tests, by file

### `store/useSimulationStore.ts` — P0

This is explicitly **not** blocked on any new dependency — Zustand stores
are just plain JavaScript objects with functions on them, testable the exact
same way `lib/v2g-simulation.ts` is tested today (call a function, check the
resulting state, no simulated browser required). The only thing standing
between this and `npm test` picking it up is `vitest.config.mts`'s `include`
pattern, currently `lib/**/__tests__/**/*.test.ts` — it would need widening
to also match something like `store/**/__tests__/**/*.test.ts`. That's a
one-line config change, not a new package, which is exactly why this is
"next in line" rather than genuinely blocked. It wasn't bundled into this
pass only because this session's scope was deliberately kept to additions
that needed *zero* config changes as well as zero new dependencies.

Specific cases worth writing, once that config change lands:

- Each setter (`setBattery`, `setEV`, `setSolar`, `setLoad`, `setCapex`,
  `setBlackoutStartHour`) only changes the fields in its own patch, leaving
  every sibling field in that section untouched — e.g. calling
  `setBattery({ capacityKwh: 15 })` should leave `reserveSocPct` and
  `startingSocPct` exactly as they were.
- Every setter flips `activePresetId` to `"custom"`, **even when the patch
  happens to exactly match the current preset's own values** — i.e. calling
  a setter with a no-op patch should still drop out of "Commuter EV" (or
  whichever preset is active) into "Custom configuration," since the store's
  rule is "you touched a slider," not "you changed a value."
- `applyPreset("off-grid-heavy")` (and the other two preset ids) sets
  `activePresetId` correctly and produces `inputs` that match calling
  `buildPresetInputs()` directly with that same preset — proving the store
  isn't quietly reimplementing preset-merging logic that could drift out of
  sync with `lib/presets.ts`.
- `applyPreset()` called with an unknown id is a no-op — this tests the
  `if (!preset) return;` guard in the store's source directly: it shouldn't
  throw, and `inputs`/`activePresetId` should be byte-for-byte unchanged
  afterward.
- `resetToDefaults()` restores `inputs` to exactly `DEFAULT_SIMULATION_INPUTS`
  and `activePresetId` to `"commuter-ev"`, starting from an arbitrarily
  mutated state (e.g. after calling several setters and an `applyPreset()`
  first) — proving reset genuinely goes back to the real defaults, not just
  "whatever it happened to look like most recently."

### `hooks/useSimulationResult.ts` / `hooks/useSensitivityMatrix.ts` — P1

Both hooks are thin `useMemo` wrappers around the engine, reading from the
Zustand store — but they're still React hooks, which can't be called like
ordinary functions in a plain Node test the way the store's setters can.
Testing them properly needs `@testing-library/react`'s `renderHook` utility,
plus a simulated-browser test environment (`jsdom`) for Vitest to run
against — neither is installed in this project today. Worth noting:
`vitest.config.mts`'s own header comment already anticipates this exact gap
("If UI component tests are added later, they'd need their own config with
`environment: "jsdom"` instead"), so the groundwork for pointing at that
need has been there since Phase 2 — it just hasn't been acted on yet.

### Component tests — P2

Not all 20 files under `components/` are equally worth automating first.
Four candidates stand out:

- **`ExecutiveSummaryCards.tsx`** — renders the headline numbers (payback,
  annual savings, resilience hours) users are most likely to trust and act
  on directly; a formatting or wiring bug here is the highest-consequence
  place for one to hide.
- **`SensitivityMatrixTable.tsx`** — Phase 6's color-bin logic was only
  proven correct by actually measuring contrast ratios by hand (see that
  phase's log); that kind of check is exactly the sort of thing that
  regresses invisibly in a refactor — the table would still render, still
  look "fine" at a glance, and just quietly fail WCAG contrast again.
- **`EVControls.tsx`** — the Phase 7 departure===arrival warning banner is a
  real, deliberately-added input-validation guard with a specific trigger
  condition; worth a direct test rather than relying on someone noticing it
  broke during a manual pass.
- **`TimeSlider.tsx`** — the Phase 7 mobile-overflow bug fix (`min-w-0` on
  the range input) lives here. This one is arguably just as well left as a
  manual/visual check rather than pushed to become an automated test — a
  `scrollWidth`/`clientWidth` viewport measurement is a layout-rendering
  check, not really a unit-testable behavior — see the matching item in the
  manual QA checklist below instead of insisting this become automated.

### Formalizing Playwright — P2

Every visual verification pass in Phases 3 through 7 relied on an ad hoc
Playwright + Chromium setup that was never installed as a real project
dependency and never saved anywhere in the repository — Phase 3's dev-log
entry describes downloading the Chromium binary and its missing system
libraries by hand into a scratch folder outside the repo, explicitly noting
"this setup lives entirely outside the repository and isn't saved anywhere
permanent — it would need to be redone in a fresh environment." Every later
phase that needed a real browser (Phase 5's flow diagram screenshots, Phase
7's `scrollWidth`/`clientWidth` mobile measurement) reused that same
throwaway approach. If development continues past MVP, installing Playwright
as a genuine `devDependency` with a saved config would turn the highest-value
checks below (contrast, layout overflow, cross-theme rendering) into
something repeatable on demand instead of a setup that gets rebuilt — and
partially rediscovered — from scratch every phase.

## Manual QA checklist

Reusable checkboxes, grouped by area. Each item is a concrete action plus a
concrete expected result, with real anchor numbers pulled directly from the
dev-log entries that first established them.

**Store and sidebar wiring**

- [ ] Move the Reserve SoC slider from 20% to 35% with the rest of the
      sidebar at default values. Expect Payback Years to shift from
      **~10.14 yrs to ~10.34 yrs** (Phase 3) — more battery reserved for
      backup means less available for everyday cost arbitrage, so payback
      should get slightly longer, not shorter.
- [ ] Click through all three presets in order and check the Solar Capacity
      reading each time: **Commuter EV → 6.6kW**, **Off-Grid Heavy →
      20.0kW**, **Solar Max → 20.0kW**, back to **Commuter EV → 6.6kW**
      (Phase 7). Confirm the preset selector itself updates to match on each
      click, not just the underlying slider value.
- [ ] After clicking any preset, manually move any one slider. Expect the
      preset selector to drop out of that preset's name into "Custom
      configuration" immediately (Phase 3/7).

**EV input validation**

- [ ] Set the EV's Arrival Time to match the default Departure Time (8am).
      Expect the departure/arrival warning banner to appear immediately, and
      the Executive Summary's resilience card to update to reflect "no added
      benefit from the EV in this scenario" (Phase 7) — the warning and the
      simulation's actual behavior should visibly agree with each other, not
      just the warning appearing in isolation.

**Mobile / responsive layout**

- [ ] At a 375px viewport width, measure
      `document.documentElement.scrollWidth` against `clientWidth`. Expect
      them to be **exactly equal** (zero horizontal page overflow) — this is
      the same measurement that first caught the real `TimeSlider.tsx`
      overflow bug in Phase 7 (a 27px gap before the fix); a raw visual
      glance is not a reliable substitute, since the bug didn't visibly
      *look* broken.
- [ ] At that same 375px width, confirm the Sensitivity Matrix Table and the
      Energy Flow Diagram both remain legible — text isn't clipped, the
      matrix's own internal horizontal scroll (inside its
      `overflow-x-auto` wrapper) works as designed, and neither component is
      what's causing any page-level overflow found above (Phase 7).

**Color and theme**

- [ ] Toggle between light and dark mode on the Sensitivity Matrix Table.
      Confirm the color ramp's direction genuinely reverses — in light mode
      a low value should render as the lightest step and a high value as the
      darkest; in dark mode that traversal direction should flip (low value
      → darkest step, high value → lightest step) — not just the raw colors
      swapping without the low/high assignment actually reversing (Phase 6).

**Charts and diagrams**

- [ ] Hover the Dual-Battery Chart at several hours and toggle its
      table-view. Confirm the hover tooltip's hour, period, both battery
      percentages, and EV plugged-in status match the table view's numbers
      for that same hour exactly (Phase 4) — the chart and its accessibility
      table twin must never disagree.
- [ ] Scrub the Energy Flow Diagram to these three anchor hours under
      default settings and confirm the active flows and their kW labels:
  - [ ] **2:00 AM** — only **Grid→Home active, 0.3kW** (an unmet-demand-only
        hour, battery sitting at its reserve floor).
  - [ ] **12:00 PM** (Solar Sponge) — **Solar→Home, 0.6kW** and the curved
        **Solar→Grid export, 4.4kW** both active; no Solar→Battery or
        Solar→EV edges (battery already full, EV away).
  - [ ] **6:00 PM** (Evening Peak) — **Solar→Home, 0.8kW** and
        **Battery→Home, 1.6kW** together exactly cover demand, with no
        Grid→Home needed.
  - [ ] The diagram's own table view matches these same numbers at each hour
        (Phase 5).

**Accessibility**

- [ ] Confirm each hour dropdown (Departure Time, Arrival Time, Blackout
      Start Time) has a visible `<label>` genuinely linked to its `<select>`
      via matching `htmlFor`/`id` (generated per-instance with `useId()`),
      not just adjacent, unlinked text (Phase 7).
- [ ] Do a full keyboard-only pass through the sidebar — Tab through every
      control, confirm focus is always visible, every slider/dropdown/preset
      button is reachable and operable without a mouse, and tabbing into an
      hour dropdown's label (or clicking it) correctly focuses the paired
      `<select>`.

**Closing blanket check (every item above, every time)**

- [ ] Zero console errors or warnings, in both light and dark mode, for
      every check above — matching the closing line of every phase's own
      Verification section in this log.

## Out of scope for now

Adopting `@testing-library/react`, `jsdom`, or Playwright as a real
`devDependency` are infrastructure decisions for a future session, not
performed by this pass — this document only recommends where they'd pay off
(see the P1/P2 items above), it doesn't install anything.

## See also

- [`phase-8-testing-strategy.md`](phase-8-testing-strategy.md) — the
  plain-language walkthrough of every test that exists today.
- [design-document.md](design-document.md)'s "Locked decisions" section — the source of
  truth for *why* the engine behaves the way it does; several of the test
  recommendations above (especially anything touching Reserve SoC, the EV
  discharge floor, or outage rules) only make sense with that section as
  context.
