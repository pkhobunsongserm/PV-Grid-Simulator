# Phase 5 — Energy Flow Diagram

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Build the most visually complex piece of the dashboard: a scrubbable,
hour-by-hour snapshot of exactly where power is coming from and going to —
Solar, Home, Stationary Battery, EV, and Grid — as hand-drawn SVG rather than
a diagramming library (see README.md's Tech Stack section for why).

## What I built

- **`components/results/TimeSlider.tsx`** — a plain "scrub through the 24
  simulated hours" control. Its value is ordinary component state, not
  anything stored in the Zustand store — it controls which *already-computed*
  hour to look at, not a simulation input.
- **`components/results/EnergyFlowDiagram.tsx`** — the diagram itself: 5
  fixed node boxes (Solar, Home, Battery, Grid, EV) laid out with Solar above
  Home and Battery/Grid/EV in a row below; up to 7 possible directed edges
  between them, each only drawn for the currently-scrubbed hour if its flow
  is actually nonzero; arrowheads, magnitude-scaled stroke width, and a
  direct kW label on every active edge; a table-view toggle showing all 24
  hours × all 7 possible flows at once.
- **A third chart color token**, `--chart-series-3` (aqua/green), added to
  `app/globals.css` for Solar — Battery and EV reuse the exact same blue/
  orange from the Phase 4 chart, so a color means the same thing everywhere
  in the app, not just within one chart.
- **`app/page.tsx`** updated to render the diagram between the Dual-Battery
  chart and the still-to-come Sensitivity Matrix placeholder.

## Key decisions & reasoning

- **Grid does not get its own bright color — it uses the same neutral gray as
  the "EV plugged in" band from Phase 4.** Each flow is colored by whichever
  node is *sourcing* it, which is naturally 4 possible identities (Solar,
  Battery, EV, Grid). But before writing any color into the component, I ran
  this project's palette validator against that exact 4-color set with the
  "any two marks might be neighbors" check (`--pairs all`) — the check this
  diagram specifically needs, since e.g. an EV→Home flow and a Grid→Home flow
  really can both be visible at once. It failed (yellow/orange, the 4th
  slot, drop below the colorblind-safety floor when adjacent). The
  documented palette is explicit that no 4-color ordering passes that check —
  at most 3 categorical hues can. Rather than ship a color set that fails a
  check I'd already run, I dropped Grid down to neutral gray, which also
  happens to fit the story better: Grid is the fallback/utility source, not a
  sized "asset" the way the other three are.
- **Flow magnitude (edge thickness) scales against a fixed reference value
  (15kW), not the biggest flow active that particular hour.** An
  hour-relative scale would make the same 5kW flow look "big" at 2am (when
  it's the only thing happening) and "small" at noon (next to a 10kW
  transfer) — using a fixed denominator means a given kW value always renders
  at the same thickness, so comparing two different hours' screenshots stays
  honest.
- **The diagram defaults to showing noon (hour 12), not "the current real
  time."** Using the visitor's actual clock would make the server-rendered
  HTML and the client's first render disagree (the server doesn't know what
  time it is in the visitor's browser), which Next.js flags as a hydration
  mismatch. Noon is a fixed, arbitrary, but deterministic choice — the same
  on every load, everywhere.
- **The table-view twin lists all 24 hours, not just the currently-scrubbed
  one.** The diagram only ever shows one hour at a time, but its
  accessibility fallback needs to expose everything the diagram *could* show
  across a full scrub — so the table is the full day, all 7 flow columns,
  not a single-row snapshot.

## Problems encountered & how I fixed them

- **The first rendered version had a real readability bug**, caught only by
  actually looking at the screenshots, not by the type-checker or tests: the
  Solar→Home and Home→Grid edges are short, direct vertical lines, and the
  arrowhead "trim" distance (pulling each line back from the node's center so
  the arrow isn't hidden under the box) was large enough that almost the
  entire line disappeared — what was left looked like a stray tick mark
  floating near the label, not a connector. Fixed by both widening the
  layout's vertical spacing (170px Solar-Home gap, 150px Home-row gap, up
  from ~120px) and shrinking the trim distance (54px → 46px), so every edge —
  even the shortest ones — keeps a clearly visible stroke.
- **A Playwright test script bug, not an app bug:** my first verification
  script clicked "View as table" and got stuck waiting forever, because BOTH
  the Dual-Battery chart and the Energy Flow Diagram have a button with that
  exact text, and a plain text-based click grabbed the first (wrong) one.
  Fixed by scoping the click to the specific `<figure>` containing "Energy
  Flow Diagram" instead of matching text anywhere on the page.
- **A self-inflicted tooling mistake:** after rebuilding with `npm run
  build`, I reflexively cleaned up with `rm -rf .next` — except a dev server
  from earlier in the phase was still running and using that same `.next`
  folder as its live cache, so deleting it out from under the running server
  corrupted its cache mid-flight and every page request started 404ing.
  Fixed by killing the now-broken dev server by its process ID and starting
  a completely fresh one. Worth remembering for later phases: don't `rm -rf
  .next` while a dev server might still be using it.

## Verification

- `npm test` — still 7/7 green (this phase didn't touch the engine).
- `npm run build` — clean compile and type-check.
- **Visual, across three representative hours and both color themes:**
  - 2:00 AM — only Grid→Home active (0.3kW), matching an unmet-demand-only,
    battery-at-reserve-floor hour.
  - 12:00 PM (Solar Sponge) — Solar→Home (0.6kW) and the curved Solar→Grid
    export (4.4kW) both active, with the battery already full and the EV away
    — correctly showing no Solar→Battery or Solar→EV edges that hour.
  - 6:00 PM (Evening Peak) — Solar→Home (0.8kW) and Battery→Home (1.6kW)
    together exactly cover demand, with no Grid→Home needed — matching the
    Phase 3 debug dump's numbers for the same hour from a much earlier
    verification pass.
  - The table view's numbers matched the diagram exactly at every hour
    checked, and zero console errors appeared in either light or dark mode.

## What's next

Phase 6 builds the Sensitivity Matrix Table, the last major visualization
piece — see the plan for its Reserve SoC × Stationary Capacity grid design.
