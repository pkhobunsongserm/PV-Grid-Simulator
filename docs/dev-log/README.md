# Development Log

> **This folder is documentation only.** Every file in here is plain Markdown —
> nothing in `docs/` is imported, referenced, or read by the app itself (no
> `.ts`/`.tsx` code, nothing in `app/`, `components/`, `lib/`, `store/`, or
> `hooks/` points at this folder). Next.js, TypeScript, ESLint, and Tailwind
> are all configured to only look inside specific folders (`app/`,
> `components/`, `pages/`, and files matching `**/*.ts`/`**/*.tsx`) — `docs/`
> sits outside every one of them. You can read, edit, reorganize, or delete
> anything in here without any effect on the running app or its build.

A phase-by-phase diary of how this project was actually built with Claude
Code — not just *what* got built (the code already shows that), but *why*
each decision was made, what went wrong along the way, and how it was fixed.
Meant to be read start to finish if you want to understand the app's history,
or dipped into per-phase if you just want the story behind one part of it.

For the durable, "this is how the app behaves and why" reference, see
[`README.md`](../../README.md) in the project root — that file is the source
of truth for locked engineering decisions. This log is the narrative behind
how those decisions (and the ones made since) came about.

## Phases

| Phase | File | What it covers |
|---|---|---|
| 1 | [phase-1-scaffold-and-data.md](phase-1-scaffold-and-data.md) | Project scaffolding, the three reference data files, initial README |
| 2 | [phase-2-simulation-engine.md](phase-2-simulation-engine.md) | The core simulation engine, types, and its test suite |
| 3 | [phase-3-store-and-sidebar.md](phase-3-store-and-sidebar.md) | Zustand store, the two calculation hooks, and every sidebar control |
| 4 | [phase-4-executive-cards-and-chart.md](phase-4-executive-cards-and-chart.md) | The first real charts: Executive Summary cards and the Dual-Battery chart |
| 5 | [phase-5-energy-flow-diagram.md](phase-5-energy-flow-diagram.md) | The hand-drawn SVG Energy Flow Diagram and its time slider |
| 6 | [phase-6-sensitivity-matrix.md](phase-6-sensitivity-matrix.md) | The Sensitivity Matrix Table's heatmap, and what it revealed about the model |
| 7 | [phase-7-presets-and-polish.md](phase-7-presets-and-polish.md) | Preset verification, a real mobile layout bug fix, input validation, and accessibility fixes |
| 8 | [phase-8-testing-strategy.md](phase-8-testing-strategy.md) | A plain-language walkthrough of the full test suite, test by test, for readers new to automated testing |

## Other reference documents

| File | What it covers |
|---|---|
| [test-recommendations.md](test-recommendations.md) | A companion to Phase 8, kept separate because it's a living recommendation document rather than a one-time diary entry |
| [handover-report.md](handover-report.md) | A full project status snapshot for both non-technical and developer readers, plus a next-steps roadmap (including the original Future Features list, preserved here for the first time) |

This was the last phase in the original build plan — every feature from the
original spec now exists, tested, and documented. Phase 8 was added
afterward as a mostly-documentation addition (with two small test additions)
that explains and hardens the test suite rather than building a new feature.
