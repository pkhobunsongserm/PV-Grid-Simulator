# Phase 3 — Zustand Store and Sidebar Controls

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Connect real user input (sliders, dropdowns, preset buttons) to the engine
built in Phase 2, and prove the whole chain works end to end — Sidebar →
store → engine → back to the screen — before spending any effort on making
the results look good (that's Phase 4 onward). The plan explicitly called
for a "temporary, ugly" results area in this phase, on purpose.

## What I built

- **`lib/reference-data.ts`** — a small cleanup pulled forward from the test
  file: centralizes the three JSON imports (and the one-line "trust me, this
  matches the type" cast) into one module, so every later file that needs the
  reference data imports from here instead of re-importing and re-casting
  the raw JSON itself. Refactored the Phase 2 test file to use it too, purely
  as a simplification — its behavior didn't change (still 7/7 passing after).
- **`store/useSimulationStore.ts`** — the Zustand store holding all ~15
  slider values plus `activePresetId`, with one setter per input section
  (`setBattery`, `setEV`, `setSolar`, `setLoad`, `setCapex`,
  `setBlackoutStartHour`), `applyPreset()`, and `resetToDefaults()`.
- **`hooks/useSimulationResult.ts`** and **`hooks/useSensitivityMatrix.ts`**
  — the `useMemo`-based bridges between the store (raw inputs) and the
  engine (pure functions) — nothing computed is ever stored a second time,
  it's always recalculated fresh from whatever the store currently holds.
- **Two shared UI primitives** — `components/controls/SliderField.tsx` (every
  slider in the app renders through this one component) and
  `components/controls/HourSelect.tsx` (an hour-of-day dropdown, used for
  departure/arrival/blackout-start, since the engine only understands whole
  hours) — plus **`components/layout/ControlSection.tsx`**, a card wrapper
  with an optional collapsed-by-default mode, used for grouping.
- **Nine control components** covering every input from the original feature
  list: `PresetSelector`, `SolarControls`, `BatteryControls`,
  `ReserveSocSlider`, `EVControls`, `LoadControls`, `BlackoutStartControl`,
  `TariffDisplay` (read-only), `CapexControls` (the new, not-in-the-original-
  spec cost assumptions, tucked under a collapsed "Advanced" section).
- **`components/layout/Header.tsx`** and **`Sidebar.tsx`**, and a rewritten
  **`app/page.tsx`** wired to a deliberately raw, temporary JSON dump of the
  live simulation result.

## Key decisions & reasoning

- **`ReserveSocSlider` is a separate component from `BatteryControls`**, even
  though both configure the same stationary battery, specifically to reflect
  README.md's point that Reserve SoC behaves asymmetrically from every other
  battery setting (see the Phase 2 log). Keeping it visually and structurally
  separate in the sidebar was a deliberate choice to avoid it *looking* like
  "just another battery slider."
- **The Critical Load % slider tracks its own "have you touched this yet?"
  flag** (`criticalLoadPctIsOverridden` in the store). By default the app
  uses the reference data's real per-hour critical-load shape; the instant
  you drag that one slider, it switches to a flat percentage formula instead
  — a real behavior change, not just a display change, so `LoadControls.tsx`
  shows which mode is currently active and offers a one-click way back to the
  default shape.
- **Any manual slider change flips `activePresetId` to `"custom"`** — so the
  UI never shows a preset as selected once the sliders no longer actually
  match it. This was a small but deliberate correctness choice in the store's
  setters, not an afterthought.

## Problems encountered & how I fixed them

- **No headless-browser tooling existed in this environment** to actually
  *look* at the running app, only to type-check/build it. Installed
  Playwright's Chromium via `npx playwright install chromium` (browser binary
  only, no `--with-deps`, since that path requires `sudo` and no password was
  available). The downloaded binary then failed to launch with
  `error while loading shared libraries: libnspr4.so: cannot open shared object file` —
  five missing system libraries (`libnspr4`, `libnss3`, `libnssutil3`,
  `libsmime3`, `libasound.so.2`). Fixed **without any root/sudo access** by
  downloading the specific `.deb` packages with `apt-get download` (which
  doesn't require root, unlike `apt-get install`), extracting them directly
  with `dpkg-deb -x` into a scratch folder (not anywhere near the system's
  real library paths), and pointing Chromium at that folder via the
  `LD_LIBRARY_PATH` environment variable at launch time. This setup lives
  entirely outside the repository and isn't saved anywhere permanent — it
  would need to be redone in a fresh environment.
- Once the browser could launch, I drove it with a small one-off Playwright
  script (not a permanent project file) to load the page, screenshot it,
  change the Reserve SoC slider via real keyboard events (not a raw DOM value
  assignment, which wouldn't trigger React's `onChange`), and screenshot
  again.

## Verification

- `npm test` — still 7/7 green after the `lib/reference-data.ts` refactor.
- `npm run build` — clean compile and type-check across every new
  store/hook/component file.
- **Visual, in a real browser:** the full sidebar rendered correctly — every
  section, including the two collapsed-by-default ones (Tariff, Advanced
  Cost Assumptions) expanding correctly on click — with zero console errors.
  Moving the Reserve SoC slider from 20% → 35% changed the JSON results dump
  immediately (payback years shifted from 10.14 to 10.34, matching the
  expectation that reserving more battery for backup leaves less available
  for everyday cost arbitrage), and the preset selector correctly dropped out
  of "Commuter EV" into "Custom configuration."

## What's next

Phase 4 replaces the raw JSON placeholder with the first real visuals —
Executive Summary cards and the Dual-Battery chart — see
[phase-4-executive-cards-and-chart.md](phase-4-executive-cards-and-chart.md).
