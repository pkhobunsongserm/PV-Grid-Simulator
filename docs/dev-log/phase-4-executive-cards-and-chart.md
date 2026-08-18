# Phase 4 — Executive Cards and the Dual-Battery Chart

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Replace the raw JSON placeholder from Phase 3 with the first real,
presentable pieces of the dashboard: the three headline stat cards, and the
hourly battery-level chart. This was also the first phase to involve any
actual data visualization, so — before writing any chart code — I loaded a
dedicated data-visualization skill for color/form guidance, rather than
picking colors and a chart type by eye.

## What I built

- **`components/results/StatCard.tsx`** — a single reusable "headline
  number" tile (label, big value, optional colored delta, optional caption).
  All three Executive cards render through this one component.
- **`components/results/ExecutiveSummaryCards.tsx`** — Financial Payback,
  Annual Tariff Savings, and Combined Resilience Backup (shown as a value
  plus a delta line, e.g. "168+h" with "+88h vs. stationary battery only" in
  green underneath).
- **`components/results/DualBatteryChart.tsx`** — an hourly line chart of
  both batteries' State of Charge, a shaded band for "EV plugged in" hours, a
  custom hover tooltip with a crosshair, a custom plain-HTML legend, and a
  table-view toggle (the chart's accessibility twin — every value the chart
  shows is also readable as a plain table, not just on hover).
- **New CSS custom properties in `app/globals.css`** — a small,
  colorblind-safety-validated set of chart tokens (`--chart-series-1`,
  `--chart-series-2`, `--chart-success`, etc.), kept deliberately separate
  from the sidebar's emerald "brand" accent color, in both light and dark
  mode.
- **Two new formatting helpers in `lib/format.ts`** — `formatHourShort()`
  (a compact axis-tick label like "6pm") and `formatHoursDelta()` (the
  "+88h" delta line).
- **`app/page.tsx`** updated to show the new cards and chart, with a small
  "still coming" note for the two pieces (Energy Flow Diagram, Sensitivity
  Matrix) that don't exist yet.

## Key decisions & reasoning

- **The Dual-Battery Chart is two lines, not a stacked area** — see the
  README.md changelog entry for the full reasoning; the short version is that
  Stationary SoC% and EV SoC% don't sum to anything meaningful, so stacking
  them would visually invent a "combined fullness" number that isn't real.
- **The two series colors (blue for Stationary, orange for EV) were
  validated, not picked by eye.** The data-viz skill's color-blindness
  validator was run against this exact pair in both light and dark mode
  before using them — all six checks (lightness band, chroma floor, CVD
  separation, normal-vision separation, contrast) passed in both modes.
- **The "EV plugged in" shading uses a neutral gray, not a third bright
  color.** It isn't a data series (a third thing being measured) — it's a
  state overlay on top of the two real series — so giving it a categorical
  hue would have made it look like a third measured quantity instead of what
  it actually is.
- **A table-view toggle was added even though nothing in the original spec
  asked for one.** The data-viz guidance treats "every chart has a
  plain-table equivalent" as a non-negotiable accessibility requirement, not
  an optional nice-to-have, so it went in during this phase rather than being
  deferred to the Phase 7 polish pass.

## Problems encountered & how I fixed them

- **Recharts v3's TypeScript types for a custom tooltip changed shape** from
  what's commonly documented for v2 — `TooltipProps` no longer includes
  `payload`/`active`/`label` at all (they're read from internal context
  instead); the correct type for a custom `content` render function is
  `TooltipContentProps`. Passing the tooltip component as a JSX element
  (`content={<ChartTooltip />}`) also failed to type-check, since Recharts
  expects either a full element with all its props already satisfied, or a
  plain function reference — switched to passing the function itself
  (`content={ChartTooltip}`). Finally, over-narrowing the tooltip's generic
  types (`TooltipContentProps<number, string>`) conflicted with how
  `<Tooltip>` infers its own generics from context — relaxed it to the
  default, untyped-generic form, which resolved cleanly since the component
  already does its own casting internally.
- **A confusing "the whole page is unstyled" false alarm.** After finishing
  the components, I restarted a dev server to screenshot it and got back a
  completely unstyled page — no fonts, no card borders, blank chart area — as
  if Tailwind had stopped working entirely. It turned out to be a leftover
  dev server from Phase 3's verification that had never actually been killed
  (only its parent `npm` wrapper process had received the stop signal, not
  the actual `next-server` process it spawned) — it was still bound to port
  3000 and serving a broken, half-compiled response, while the *new* server
  had silently started on port 3001 instead. Traced it with `ss -ltnp`,
  force-killed the specific lingering process IDs directly (rather than
  trusting the port-based kill again), and confirmed the correct server came
  up cleanly on port 3000 afterward. Re-ran the same verification and it
  looked correct.
- Cross-checked the *shape* of the resulting chart against known engine
  behavior, not just "does it render without crashing" — e.g. confirmed the
  stationary battery line visibly rises during the mid-day solar-surplus
  hours and the EV line drops once at its departure hour and stays flat while
  away, matching the dispatch rules from Phase 2 rather than just looking
  plausible.

## Verification

- `npm test` — still 7/7 green (this phase didn't touch the engine).
- `npm run build` — clean compile and type-check, including the Recharts
  type fixes above.
- **Visual, in both light and dark mode:** hovering the chart shows the
  correct hour, period, both battery percentages, and the EV's plugged-in
  status; the table-view toggle shows the exact same numbers as the chart;
  zero console errors in either color scheme.

## What's next

Phase 5 builds the Energy Flow Diagram (a custom SVG, not a chart library —
see README.md for why) and Phase 6 builds the Sensitivity Matrix Table.
