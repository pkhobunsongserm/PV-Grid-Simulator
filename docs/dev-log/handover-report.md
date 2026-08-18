# Handover Report

*Snapshot as of August 18, 2026.*

> Documentation only — see the note at the top of [the index](README.md).

## How to read this

This file is written for two different readers at once, on purpose:

- **If you're checking on progress and don't plan to touch code**: read
  "Executive Summary" and "Project Status at a Glance" below, then stop. That's
  the whole picture in plain language.
- **If you're picking up development** (you, in a future session, or someone
  else): keep going through the rest of this file, then follow its pointers
  out to [`README.md`](../../README.md) — that's the actual source of truth
  for how the app behaves and why; this file is a summary and a map, not a
  replacement for it.

## Executive Summary

This project is a web app that helps a homeowner in Melbourne, Australia
decide whether a home battery and a bidirectional-charging electric vehicle
(one that can send power *back* into the house, not just draw power from it)
are worth buying — and if so, how big to make them. You move sliders
describing your solar panels, battery, EV, and daily electricity use, and the
app instantly shows how many years it would take to pay for itself, how much
you'd save per year, and how many hours your home could keep running essential
appliances during a blackout.

**Current state: the originally-planned app is fully built and working**, every
number on screen has an automated test protecting it or has been manually
checked, and it runs cleanly with no known bugs. Beyond the original plan, a
dedicated pass was done to strengthen and document the test suite. What's
*not* done yet — by choice, not oversight — is explained in "Known
Limitations" and "What's Next" below.

## What This App Does

Opening the app, you see two halves of the screen:

- **The left sidebar** is where you describe your situation: how big your
  solar panels are, how big your home battery is (and how much of it you want
  kept in reserve for a blackout, separate from everyday use), your EV's
  battery size and charging speed, when it leaves for and returns from your
  daily commute, how much electricity your household typically uses, and what
  time you want to simulate a blackout starting. Three preset buttons
  ("Commuter EV," "Off-Grid Heavy," "Solar Max") fill in a sensible starting
  point instantly instead of making you set 15 things by hand.
- **The right-hand results area** updates live as you move any slider:
  - **Three headline numbers** — how many years until the system pays for
    itself, how much you'd save per year, and how many hours of backup power
    you'd have during a blackout (shown both with and without the EV's help).
  - **A battery-level chart** — both batteries' charge level across a full
    day, with a shaded band showing when the EV is actually home and able to
    help.
  - **An energy flow diagram** — a live picture of exactly where your power is
    coming from and going to at any hour you scrub to (solar, battery, EV,
    grid, or your house), with arrows sized by how much power is flowing.
  - **A sensitivity matrix** — a grid letting you compare "what if I set the
    battery reserve and size differently?" across many combinations at once,
    color-coded so patterns are easy to spot.

Every one of these updates instantly and consistently — there's no "submit"
button, no loading spinner, no backend server. Everything is calculated in
your browser the moment you touch a slider.

## Project Status at a Glance

Every feature from the original plan exists and works:

- [x] Input sidebar — battery, EV/V2G, solar, household demand, tariff display, cost assumptions
- [x] 24-hour simulation engine (solar, battery, EV, grid — the core calculation)
- [x] Blackout/resilience simulator
- [x] Executive summary cards (payback, savings, resilience hours)
- [x] Dual-battery state-of-charge chart
- [x] Energy flow diagram
- [x] Sensitivity matrix table
- [x] Three starting presets
- [x] Mobile-responsive layout, light/dark mode, basic accessibility pass

**Test and build health, reconfirmed the moment this report was written:**
`npm test` → **25 of 25 automated tests passing**; `npm run build` → **clean,
no errors or warnings**. Those 25 tests all protect the *calculation engine*
(the math) and the *number-formatting helpers* (how those numbers get turned
into on-screen text) — the parts of the app where a silent bug would be
hardest to notice and most damaging if it slipped through.

**Being honest about what that does and doesn't cover**: everything you
actually click, drag, and see on screen — the sidebar, the store that holds
your slider settings, and all 20 visual components — has been carefully
checked by hand, once per phase, using a real browser, but does **not** yet
have automated tests protecting it going forward. That means a future code
change *could* silently break something visual (a mislabeled slider, a chart
that stops updating) without any test turning red to catch it. This isn't an
oversight — it's a deliberate, documented next step. See
[`phase-8-testing-strategy.md`](phase-8-testing-strategy.md) for exactly
what *is* tested and why, and
[`test-recommendations.md`](test-recommendations.md) for a prioritized plan
to close the rest of that gap.

## How This Was Built

The whole app was built incrementally, phase by phase, each one reviewed and
verified (often with real browser screenshots) before moving to the next. The
full story — including what went wrong and how it was fixed — lives in
[`docs/dev-log/`](README.md):

1. **Scaffold, data, README** — the Next.js project itself, the three reference data files, and the project's living reference document written up front.
2. **Simulation engine** — the core calculation logic, built and tested in isolation before any screen existed.
3. **Store and sidebar** — every input control, wired to the engine.
4. **Executive cards + battery chart** — the first real visuals.
5. **Energy flow diagram** — the most visually complex piece.
6. **Sensitivity matrix** — the last visualization, which also caught and confirmed some genuinely subtle engine behavior.
7. **Presets and polish** — real bugs found and fixed (a mobile layout issue, an accessibility gap) plus input-validation guards.
8. **Testing strategy** — strengthening and documenting the automated test suite.

## For Developers: Getting Oriented

- **Stack**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Zustand
  (shared slider state) + Recharts (one chart) + Vitest (tests). No backend,
  no database — everything runs in the browser.
- **Where the code lives**: `lib/` holds all the calculation logic with zero
  UI code in it (this is what makes it testable in isolation); `store/` holds
  the current slider values; `hooks/` connects the store to the calculations;
  `components/` holds everything visual. Full breakdown in `README.md`'s
  "Project structure" section.
- **Three commands you need**: `npm run dev` (start it locally), `npm test`
  (run the automated tests), `npm run build` (production build / full
  type-check).
- **Before changing any calculation logic**, read `README.md`'s "Locked
  decisions" section (11 numbered rules) — it documents *why* the engine
  behaves the way it does, so a change that seems like an obvious fix doesn't
  accidentally break something that was deliberate.
- **Code comments throughout the project** are written for someone
  comfortable with code but new to this specific stack — every file explains
  what it's for and why, not just what it does. See `README.md`'s "Code
  documentation standard" section.

## Known Limitations (intentional, not bugs)

These are real simplifications the app makes on purpose, documented in
`README.md`'s "Locked decisions" — worth knowing about before trusting the
numbers for a real financial decision:

- The battery and EV only ever charge from **free excess solar power**, never
  by deliberately buying cheap grid electricity to use later — a real
  optimization real systems do, left out of this version.
- Savings are projected from **one typical day, multiplied by 365** — it
  doesn't account for seasons or weekday/weekend differences, which is the
  single biggest source of uncertainty in the savings estimate.
- **Battery wear over time isn't modeled** — no cost is attached to the extra
  charge/discharge cycling the EV goes through from being used for backup
  power.
- **Solar export isn't capped** — many Australian electricity networks legally
  limit how much solar you're allowed to sell back to the grid; this app
  assumes no such limit, which can overstate savings for larger systems.

## What's Next

### Testing (closing the coverage gap)

In priority order, detailed fully in
[`test-recommendations.md`](test-recommendations.md):

1. **The Zustand store** (`store/useSimulationStore.ts`) — the next, highest-value
   target. Needs no new software installed, only a small one-line
   configuration change to let the test runner find store tests at all.
2. **The two calculation hooks** — need two new development tools
   (`jsdom` and `@testing-library/react`) that aren't installed yet.
3. **The most important visual components** (the executive cards, the
   sensitivity matrix, the EV warning banner) — same new-tooling requirement
   as above.
4. **Making the ad hoc browser-testing setup permanent** — every visual check
   done across Phases 3-7 used a browser-testing tool that was installed
   fresh and thrown away each time, rather than saved as part of the project.

### Features (beyond the original MVP)

This list comes from the very first planning conversation for this project —
it was never actually saved anywhere in the repository until now, so it's
being written down here for the first time, in roughly the order it was
originally prioritized:

1. **Letting the battery/EV buy cheap grid power to use later**, not just
   free solar — the natural next step once the current, simpler approach is
   proven out; it's a materially harder calculation to get right, since it
   requires forecasting whether a purchase now will pay off later.
2. **Modeling different seasons and weekday-vs-weekend usage**, instead of
   one representative day — would make the savings estimate meaningfully more
   trustworthy.
3. **Battery wear/degradation costs** — especially relevant for the EV, since
   using it for backup power adds extra wear beyond normal driving.
4. **Solar export limits**, matching what real Australian electricity
   networks actually allow.
5. **Shareable saved scenarios** — turning your current slider settings into
   a link you can send someone else, with no account or server needed.
6. **Uploading your own real electricity usage data** (from a smart meter)
   instead of the built-in example household, to see how the model performs
   against your actual bills.
7. **Comparing financing options** — cash, loan, or lease — since "years to
   pay back" alone doesn't capture the cost of borrowing money to buy the
   system.
8. **Earning money from grid services** — some batteries can earn extra
   income by helping stabilize the wider electricity grid, on top of the
   savings this app already calculates.
9. **Supporting a second EV** — the current model assumes exactly one.
10. **Showing the environmental impact**, not just the financial one — how
    "clean" the electricity being used or avoided is, at different times of
    day.

## Where to Find Things

| Looking for... | Go to |
|---|---|
| How the app is supposed to behave, and why | [`README.md`](../../README.md) |
| The build story, phase by phase | [`docs/dev-log/`](README.md) |
| What's tested today, explained simply | [`phase-8-testing-strategy.md`](phase-8-testing-strategy.md) |
| What testing to add next, plus a manual checklist | [`test-recommendations.md`](test-recommendations.md) |
| This report | You're reading it |

One last note for future reference: the very first architecture plan for this
project — including the original version of the feature roadmap reproduced
above — was written into a local Claude Code planning file on the machine
this project was built on, not into the repository itself. That file has
since been overwritten twice by later planning sessions (it holds one plan at
a time), so this report is now the only place that roadmap still exists
on-record. Worth keeping that in mind if a "the plan said..." question ever
comes up about something not covered in this repo's own documentation.
