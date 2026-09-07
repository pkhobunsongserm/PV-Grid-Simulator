// -----------------------------------------------------------------------------
// components/results/SensitivityMatrixTable.tsx
//
// A grid comparing Reserve SoC% (rows) against Stationary Battery Capacity
// (columns), showing how either choice trades off against Financial Payback
// or Survival Hours — whichever the toggle above the table currently selects.
//
// WHY A PLAIN TABLE, NOT A CHART: this is fundamentally "read a specific
// number off a grid of many numbers" — a table does that better than any
// chart type would. The background color behind each number is a supporting
// visual aid (see the color scale note below), not the only way to read a
// value — every cell's exact number is always printed as text, so this
// doesn't need a separate accessibility "table view" toggle the way the
// chart components do; it already IS the table.
// -----------------------------------------------------------------------------
"use client";

import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useSensitivityMatrix } from "@/hooks/useSensitivityMatrix";
import { useSimulationStore } from "@/store/useSimulationStore";
import { InfoLink } from "@/components/common/InfoLink";
import { formatPaybackYears, formatSurvivalHours } from "@/lib/format";
import type { SensitivityMatrixCell } from "@/lib/types";

// "survivalStationary" counts the stationary battery alone — this is the
// number that actually moves as you sweep the matrix's own columns.
// "survivalCombined" adds the EV in too, matching the Executive Summary
// cards, but for any household that owns an EV its large fixed capacity
// swamps the stationary battery's contribution almost everywhere on the
// grid, making the table look like battery size "does nothing." See
// SensitivityMatrixCell in lib/types.ts for the full explanation.
type Metric = "payback" | "survivalStationary" | "survivalCombined";

/** Pulls the right raw number (or null) out of a cell for whichever metric
 * is currently selected — kept as one small function so every place that
 * needs "the current metric's value" (coloring, formatting, min/max) reads
 * it the same way. */
function metricValue(cell: SensitivityMatrixCell, metric: Metric): number | null {
  if (metric === "payback") return cell.paybackYears;
  if (metric === "survivalStationary") return cell.survivalHoursStationaryOnly;
  return cell.survivalHoursCombined;
}

function formatCell(cell: SensitivityMatrixCell, metric: Metric): string {
  if (metric === "payback") return formatPaybackYears(cell.paybackYears);
  if (metric === "survivalStationary")
    return formatSurvivalHours(cell.survivalHoursStationaryOnly, cell.survivalHoursStationaryOnlyExhausted);
  return formatSurvivalHours(cell.survivalHoursCombined, cell.survivalHoursCombinedExhausted);
}

const HEATMAP_BINS = 5;

/** Which of the 5 sequential color bins a value falls into, scaled between
 * this metric's own min and max across the WHOLE matrix (not some fixed
 * absolute scale) — so the color always shows "relatively high/low within
 * what you're currently looking at," which is the more useful reading for a
 * what-if grid like this one. */
function binIndexFor(value: number, min: number, max: number): number {
  if (max === min) return Math.floor(HEATMAP_BINS / 2); // every cell identical — use the middle bin
  const ratio = (value - min) / (max - min);
  return Math.min(HEATMAP_BINS - 1, Math.max(0, Math.round(ratio * (HEATMAP_BINS - 1))));
}

export function SensitivityMatrixTable() {
  const matrix = useSensitivityMatrix();
  const [metric, setMetric] = useState<Metric>("payback");
  const ownsEv = useSimulationStore((s) => s.inputs.ev.ownsEv);

  // "survivalCombined" is identical to "survivalStationary" whenever the
  // household has no EV (there's nothing to combine), so that toggle option
  // is hidden below — this falls the displayed metric back to
  // "survivalStationary" without losing the user's chosen selection, in case
  // they flip EV ownership back on later.
  const activeMetric = metric === "survivalCombined" && !ownsEv ? "survivalStationary" : metric;

  // Which cell the sidebar's ACTUAL current sliders land closest to, so it
  // can be outlined below for orientation — the sliders move continuously,
  // but the matrix only samples a handful of fixed steps, so "closest" (not
  // "exact match") is what's actually useful here.
  const currentReserveSocPct = useSimulationStore((s) => s.inputs.battery.reserveSocPct);
  const currentCapacityKwh = useSimulationStore((s) => s.inputs.battery.capacityKwh);

  const { nearestRowIndex, nearestColIndex } = useMemo(() => {
    const rowSteps = matrix.map((row) => row[0].reserveSocPct);
    const colSteps = matrix[0].map((cell) => cell.stationaryCapacityKwh);
    const closestIndex = (steps: number[], target: number) =>
      steps.reduce(
        (bestIndex, step, index) =>
          Math.abs(step - target) < Math.abs(steps[bestIndex] - target) ? index : bestIndex,
        0
      );
    return {
      nearestRowIndex: closestIndex(rowSteps, currentReserveSocPct),
      nearestColIndex: closestIndex(colSteps, currentCapacityKwh),
    };
  }, [matrix, currentReserveSocPct, currentCapacityKwh]);

  const { min, max } = useMemo(() => {
    const values = matrix
      .flat()
      .map((cell) => metricValue(cell, activeMetric))
      .filter((v): v is number => v !== null);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [matrix, activeMetric]);

  return (
    <figure
      className="rounded-lg border p-4"
      style={{ backgroundColor: "var(--chart-surface)", borderColor: "var(--chart-border)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" style={{ color: "var(--chart-text-primary)" }}>
          <Grid3x3 className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-semibold">Sensitivity Matrix</span>
        </div>

        {/* A segmented toggle, not separate checkboxes — exactly one metric is
         * shown at a time, never more than one encoded into color at once
         * (that would need overlapping color scales on one grid, which is
         * unreadable). The "+ EV" option only appears for a household that
         * actually owns one — otherwise it would just repeat the "Battery
         * Only" numbers, see the activeMetric fallback above. */}
        <div className="flex rounded-md border text-xs" style={{ borderColor: "var(--chart-border)" }}>
          {(
            [
              ["payback", "Payback Years"],
              ["survivalStationary", "Survival Hours (Battery Only)"],
              ...(ownsEv ? ([["survivalCombined", "Survival Hours (+ EV)"]] as const) : []),
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMetric(value)}
              aria-pressed={activeMetric === value}
              className="px-3 py-1.5 font-medium"
              style={{
                backgroundColor: activeMetric === value ? "var(--chart-series-1)" : "transparent",
                color: activeMetric === value ? "#ffffff" : "var(--chart-text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs" style={{ color: "var(--chart-muted)" }}>
        Rows: Stationary Reserve SoC. Columns: Stationary Battery Capacity.
        {activeMetric === "survivalCombined" &&
          " EV capacity stays fixed at your current setting and is added on top of the stationary battery being swept below — for a household with an EV, that fixed contribution can dwarf the stationary battery's own effect, so it's easy for these numbers to look flat across a whole row; switch to \"Battery Only\" to see the stationary battery's effect in isolation."}
        {activeMetric !== "payback" &&
          " Reserve SoC (rows) only visibly moves these numbers when the blackout starts before that day's solar has recharged the battery — change the Outage Simulator's Blackout Start Time to see rows flatten or diverge."}
        {" "}Darker cells are a <em>higher</em>{" "}
        {activeMetric === "payback" ? "payback (worse)" : "survival time (better)"} — color always
        tracks magnitude, not &ldquo;good vs. bad,&rdquo; since payback and survival point in
        opposite directions. The outlined cell is closest to your current sliders.{" "}
        <InfoLink id="matrix" /> <InfoLink id="reserve-timing" label="Reserve SoC vs. timing" />
      </p>

      <div className="overflow-x-auto">
        <table className="border-separate text-center text-xs" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="px-2 py-1 text-right align-bottom" style={{ color: "var(--chart-muted)" }}>
                Reserve SoC ↓ / Capacity →
              </th>
              {matrix[0].map((cell) => (
                <th key={cell.stationaryCapacityKwh} className="px-2 py-1 font-medium" style={{ color: "var(--chart-text-primary)" }}>
                  {cell.stationaryCapacityKwh} kWh
                  {/* With no EV, combinedCapacityKwh always equals
                   * stationaryCapacityKwh (see getEffectiveEVConfig() in
                   * lib/v2g-simulation.ts) — showing it here would just
                   * repeat the number above for no reason. */}
                  {ownsEv && (
                    <div className="text-[10px] font-normal" style={{ color: "var(--chart-muted)" }}>
                      {cell.combinedCapacityKwh} kWh combined
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={row[0].reserveSocPct}>
                <th
                  scope="row"
                  className="px-2 py-1 text-right font-medium"
                  style={{ color: "var(--chart-text-primary)" }}
                >
                  {row[0].reserveSocPct}%
                </th>
                {row.map((cell, colIndex) => {
                  const value = metricValue(cell, activeMetric);
                  const isCurrent = rowIndex === nearestRowIndex && colIndex === nearestColIndex;
                  const bin = value === null ? null : binIndexFor(value, min, max);
                  const bg = bin === null ? "var(--chart-seq-null-bg)" : `var(--chart-seq-${bin}-bg)`;
                  const fg = bin === null ? "var(--chart-seq-null-text)" : `var(--chart-seq-${bin}-text)`;
                  return (
                    <td
                      key={cell.stationaryCapacityKwh}
                      className="px-2 py-2 tabular-nums"
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        outline: isCurrent ? "2px solid var(--chart-text-primary)" : "none",
                        outlineOffset: isCurrent ? "-2px" : undefined,
                      }}
                    >
                      {formatCell(cell, activeMetric)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
