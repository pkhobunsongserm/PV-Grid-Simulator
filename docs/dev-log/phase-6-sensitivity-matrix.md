# Phase 6 — Sensitivity Matrix Table

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Build the last major visualization piece: a grid comparing Reserve SoC%
against Stationary Battery Capacity, showing how either choice trades off
against Financial Payback or Survival Hours. With this phase done, every
piece of the original feature spec's Visualization Dashboard exists.

## What I built

- **`components/results/SensitivityMatrixTable.tsx`** — a plain HTML table
  (not a chart — see its header comment for why), with a Payback/Survival
  toggle, a sequential blue color ramp behind each cell scaled to that
  metric's own min/max across the grid, and the cell closest to the sidebar's
  actual current sliders outlined for orientation.
- **10 new CSS custom properties in `app/globals.css`** — 5 background/text
  pairs for the heatmap's color bins, plus one pair for "N/A" cells, each
  redefined for dark mode with the ramp direction reversed (see below).
- **A small, well-justified engine change**: extended `SensitivityMatrixCell`
  (in `lib/types.ts`) with a `survivalHoursCombinedExhausted` flag, and
  `runSensitivityMatrix()` (in `lib/v2g-simulation.ts`) to populate it. The
  matrix was already computing this internally — it just wasn't being handed
  back out — so the table couldn't previously tell "168 hours, exactly" apart
  from "168+, hit the simulation's cap," unlike everywhere else in the app.
  Updated the Phase 2 regression test to check the new field too.

## Key decisions & reasoning

- **The color ramp encodes magnitude only, never "good vs. bad."** Darker
  always means "a bigger number," for both metrics — even though a bigger
  number is *worse* for Payback Years and *better* for Survival Hours. A
  ramp that flipped its "darker = better" meaning depending on which metric
  was selected would be more confusing, not less, so the table's caption
  spells out which direction is good for whichever metric is currently
  showing, rather than trying to bake that into the color itself.
- **The heatmap uses 5 discrete color bins, not a smooth continuous
  gradient**, taken verbatim from this project's documented sequential blue
  ramp (steps 100/250/400/550/700) — a common, well-understood choice for a
  small grid like this (63 cells), and every cell also prints its exact
  number as text regardless of color, so the color is a supporting aid, not
  the only way to read a value.
- **Each color bin's text color (dark ink vs. white) was chosen by actually
  measuring contrast**, not by eyeballing a light/dark split down the
  middle of the 5 bins. The obvious "3 light bins get dark text, 2 dark bins
  get white text" split turned out to fail WCAG's 4.5:1 normal-text
  threshold at the boundary (the middle bin, #3987e5, only hit 3.64:1
  against white) — measuring first caught this before it shipped; the actual
  split ended up being "the first 3 bins get dark text" once verified.
- **Dark mode reverses which end of the ramp is used**, not just which
  colors: in light mode, a low value gets the *lightest* step (near the
  light page background, "receding") and a high value gets the *darkest*
  step ("popping"). On a dark page, keeping that same order would mean a low
  value gets a very pale, bright color that visually shouts instead of
  receding — so dark mode swaps the traversal direction, low value → darkest
  step (blends toward the dark surface), high value → lightest step (pops
  against it). Same 5 documented hex values in both modes, just walked in
  opposite directions.
- **The color scale is normalized against the CURRENT matrix's own min/max**,
  not some fixed absolute scale. This means the same raw payback number could
  render as a different color shade if some other slider (e.g. Solar
  Capacity) changes and shifts the whole matrix's range — a deliberate
  trade-off, since "where does this cell sit relative to everything else
  you're currently comparing" is more useful here than a fixed universal
  scale would be for what this table is actually for (comparing options
  against each other, not against a fixed external benchmark).
- **The "current cell" outline finds the CLOSEST sampled cell, not an exact
  match.** The Reserve SoC and Battery Capacity sliders move continuously
  (down to 0.5kWh steps), but the matrix only samples 9×7 fixed points, so
  most slider positions won't land exactly on a sampled cell. Highlighting
  the nearest one is more useful than requiring an exact match (which would
  often highlight nothing at all).

## Problems encountered & how I fixed them

- **ESLint failed the build** on an unescaped `"` character inside JSX text
  (`react/no-unescaped-entities` — a real rule, not a false positive; raw
  quote characters in JSX text can be ambiguous). Fixed by using the
  `&ldquo;`/`&rdquo;` HTML entities instead of literal curly quotes.
- **Not a bug, but worth recording as a genuine finding from testing:** with
  the app's default settings, the Survival Hours view of the matrix renders
  as a single flat color — every one of the 63 cells shows "168+h." This
  looked like a rendering bug at first glance. It isn't: the default EV
  (60kWh, connected at the default 6pm blackout hour) is, on its own, more
  than enough to cover the default (fairly low) critical load for a full
  simulated week, regardless of what the stationary battery is set to — so
  there's genuinely no variation to show under those specific defaults. I
  confirmed this by testing that same view with Critical Load% cranked up
  significantly: real variation appeared immediately (each stationary
  capacity step producing a distinctly different, correctly-colored survival
  number), which also surfaced a second finding — Survival Hours varies ONLY
  by column (Stationary Capacity), never by row (Reserve SoC). That's
  correct, not a bug either: the engine deliberately drains the stationary
  battery to 0% in any outage regardless of its reserve setting (see
  README.md decision #4), so Reserve SoC genuinely has zero effect on
  survival time — only on the *Payback* metric, where it does vary by row,
  since it affects everyday (non-outage) dispatch and cost.

## Verification

- `npm test` — 7/7 green, including the updated regression test for the new
  `survivalHoursCombinedExhausted` field.
- `npm run build` — clean compile and type-check.
- **Visual, in both light and dark mode:** the Payback Years view showed a
  clear, correctly-ordered gradient (higher stationary capacity → higher
  payback, in this scenario, since more upfront capex outweighs the extra
  savings at these settings); the current-settings cell was correctly
  outlined at the row/column nearest the sidebar's actual sliders; dark
  mode's reversed ramp read correctly (low values dark/receding, high values
  light/popping); zero console errors throughout, including the deliberate
  stress-test with an extreme Critical Load% value.

## What's next

Phase 7 (presets + polish) is UI refinement — wiring the preset buttons fully
through, adding input validation guards, a responsive/mobile pass, and an
accessibility pass — not new components. Every piece of the Visualization
Dashboard from the original feature spec now exists.
