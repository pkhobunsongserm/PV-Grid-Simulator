# Phase 7 — Presets and Polish

> Documentation only — see the note at the top of [the index](README.md).

## Goal

The last phase in the original plan: verify the three preset buttons
actually work end to end (not just that the store logic exists), do a real
mobile pass, add the two input-validation guards the plan specifically
called for, an accessibility pass on the sliders/dropdowns, and a final
read-through of `README.md` to catch anything that had drifted out of date
as the previous six phases were built. No new visualization components —
everything the dashboard needs already existed after Phase 6.

## What I built

- **`components/controls/HourSelect.tsx`** — fixed a real accessibility gap:
  the visible `<label>` next to each hour dropdown (Departure Time, Arrival
  Time, Blackout Start Time) was never actually linked to its `<select>` —
  they were just two unrelated pieces of text and a form control as far as
  a screen reader is concerned. Fixed with React's `useId()` generating a
  unique, collision-safe id per rendered instance, paired via
  `htmlFor`/`id`.
- **`components/controls/EVControls.tsx`** — added the input-validation
  guard the plan specifically asked for: a visible warning when Departure
  and Arrival are set to the same hour, explaining that the EV will be
  treated as never home (a legal, intentional value per README.md #5, but
  an easy one to land on by accident and confusing to see silently do
  nothing).
- **`components/results/SensitivityMatrixTable.tsx`** — added `aria-pressed`
  to the Payback/Survival toggle buttons, matching the pattern already used
  by the preset buttons.
- **`components/results/TimeSlider.tsx`** — fixed a real mobile layout bug
  (see below).
- **`README.md`** — three small accuracy fixes caught during the read-through
  pass (see below), plus this phase's changelog entry.

## Key decisions & reasoning

- **The Reserve SoC "don't exceed 80%" guard from the plan needed no new
  code** — it was already fully enforced structurally, since the slider's
  `max={80}` makes exceeding it physically impossible through the UI. Adding
  a redundant runtime check for a value the input element itself can't
  produce would be validating against a case that can't happen.
- **The EV schedule warning is informational, not blocking.** Nothing
  prevents Departure and Arrival from being set to the same hour — it's a
  legal configuration with defined behavior — the warning exists purely so
  the (correct, intentional) consequence isn't mistaken for a bug.

## Problems encountered & how I fixed them

- **A real, reproducible mobile bug**, only caught by actually measuring
  `document.documentElement.scrollWidth` against `clientWidth` at a 375px
  viewport (visual inspection alone didn't reveal it — the page didn't
  *look* broken, it just had a ~27px invisible horizontal scroll):
  `TimeSlider.tsx`'s row has two fixed-width labels and a `flex-1` range
  input between them, but flex items default to `min-width: auto`, which
  refuses to let an element shrink below its browser-default intrinsic width
  — `flex-1` alone doesn't override that default, so the range input was
  quietly forcing the whole page a few pixels wider than the viewport on
  narrow screens. Fixed by adding `min-w-0` to the input, which is the
  standard override for exactly this default. Confirmed fixed by re-running
  the same `scrollWidth`/`clientWidth` measurement (27px overflow → 0px)
  rather than trusting a screenshot alone.
- **A false alarm during the same investigation, worth recording so it
  isn't "fixed" again by mistake later:** an earlier, cruder diagnostic
  flagged the Sensitivity Matrix Table's `<table>` element (and everything
  inside it) as "wider than the viewport." That's expected and correct —
  the table sits inside a `overflow-x-auto` wrapper specifically so it CAN
  be wider than its visible container and scroll horizontally. The
  diagnostic script's flaw was checking each element's own `overflow-x`
  style without checking whether an ANCESTOR was already containing that
  overflow. The real signal was always the document-level
  `scrollWidth`/`clientWidth` comparison, not "is any individual element
  wide."

## Verification

- `npm test` — still 7/7 green (no engine changes this phase).
- `npm run build` — clean compile and type-check.
- **Mobile, both themes:** `document.documentElement.scrollWidth` exactly
  equals `clientWidth` at a 375px viewport (zero horizontal overflow) after
  the `TimeSlider` fix, confirmed on the full page in both light and dark
  mode. The Sensitivity Matrix Table and Energy Flow Diagram both scale down
  and remain legible at that width, with the matrix's internal horizontal
  scroll working as designed.
- **Presets, driven end to end via a real click, not just inspecting store
  code:** Solar Capacity read 6.6kW by default, jumped to 20.0kW on both
  "Off-Grid Heavy" and "Solar Max" (matching their preset definitions
  exactly), and returned to 6.6kW on "Commuter EV" — confirming
  `applyPreset()` actually reaches the sliders, not just the store's
  internal state.
- **EV schedule warning:** setting Arrival Time to match the default
  Departure Time (8am) made the warning banner appear immediately, and the
  Executive Summary's resilience card correctly updated to "no added benefit
  from the EV in this scenario" — the warning and the simulation's actual
  behavior agree with each other.
- Zero console errors across every check in this phase.

## What's next

This was the last phase in the original build plan. Every feature from the
original spec exists, tested, and documented. The original planning
conversation's "Future Features (post-MVP)" list (grid-charging batteries,
seasonal profiles, battery degradation modeling, network export limits, and
others) is where post-MVP ideas live if development continues — that list
isn't duplicated into README.md itself, since README.md documents how the
*existing* app behaves, not a roadmap for what it might become.
