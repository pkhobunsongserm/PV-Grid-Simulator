// -----------------------------------------------------------------------------
// components/results/DualBatteryChart.tsx
//
// Shows both batteries' State of Charge (SoC%) across the simulated day, plus
// which hours the EV was physically plugged in.
//
// DESIGN NOTE — why this is two LINES, not a stacked area (even though the
// original feature list called it a "stack chart"): stacking only makes sense
// when the segments sum to something meaningful (e.g. two products' sales
// adding up to total revenue). Stationary SoC% + EV SoC% summing to, say,
// 130% doesn't mean anything — they're two independent batteries, not parts of
// one whole. Stacking them would visually invent a "combined fullness" number
// that doesn't exist and would be actively misleading. Both share the same
// 0-100% unit and axis, so a two-line chart (one color per battery) is the
// correct form for "compare two same-unit series over time." The component
// keeps its original name (matching the file name already documented in
// README.md) since it still shows both batteries together — just not stacked.
//
// The shaded band for "EV plugged in" is deliberately NOT one of the two
// series colors — it isn't data identity, it's a state overlay — so it uses a
// neutral gray instead, explained in its own legend entry.
// -----------------------------------------------------------------------------
"use client";

import { useMemo, useState } from "react";
import { BatteryCharging, Table2, LineChart as LineChartIcon } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import { useSimulationResult } from "@/hooks/useSimulationResult";
import { formatHourShort, formatHour } from "@/lib/format";
import type { HourlyState } from "@/lib/types";

// Only label every 3rd hour on the x-axis (0, 3, 6, ... 21) — labeling all 24
// would crowd the axis into unreadable text. The tooltip and table view still
// give access to every individual hour.
const X_AXIS_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

/** Turns the hour-by-hour "was the EV plugged in?" flags into a list of
 * contiguous shaded intervals for the chart (e.g. plugged in hours 18-23 and
 * 0-7 becomes two separate bands, since the chart draws one linear day rather
 * than wrapping around midnight). Each interval is padded half an hour on
 * each side so the shading visually centers on the hours it covers, matching
 * where each hour's data point sits on the axis. */
function findPluggedInIntervals(hourlyStates: HourlyState[]): { x1: number; x2: number }[] {
  const intervals: { x1: number; x2: number }[] = [];
  let runStart: number | null = null;

  for (const state of hourlyStates) {
    if (state.evPluggedIn && runStart === null) {
      runStart = state.hour;
    }
    if (!state.evPluggedIn && runStart !== null) {
      intervals.push({ x1: runStart - 0.5, x2: state.hour - 0.5 });
      runStart = null;
    }
  }
  // The day ended while still mid-run (e.g. plugged in through hour 23).
  if (runStart !== null) {
    intervals.push({ x1: runStart - 0.5, x2: 23.5 });
  }
  return intervals;
}

/** Custom tooltip: values lead (bold), series names follow, each keyed with a
 * short line of its series color rather than a filled box. Also reports the
 * EV's plugged-in status, since that's central to reading this chart. */
function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as HourlyState;

  return (
    <div
      className="rounded-md border px-3 py-2 text-sm shadow-sm"
      style={{ backgroundColor: "var(--chart-surface)", borderColor: "var(--chart-border)" }}
    >
      <div className="mb-1 font-medium" style={{ color: "var(--chart-text-primary)" }}>
        {formatHour(Number(label))} · {point.period}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3" style={{ backgroundColor: "var(--chart-series-1)" }} />
        <span style={{ color: "var(--chart-text-secondary)" }}>Stationary</span>
        <span className="font-semibold" style={{ color: "var(--chart-text-primary)" }}>
          {Math.round(point.stationarySocPct)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3" style={{ backgroundColor: "var(--chart-series-2)" }} />
        <span style={{ color: "var(--chart-text-secondary)" }}>EV</span>
        <span className="font-semibold" style={{ color: "var(--chart-text-primary)" }}>
          {Math.round(point.evSocPct)}%
        </span>
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--chart-muted)" }}>
        EV is {point.evPluggedIn ? "plugged in at home" : "away (commuting)"}
      </div>
    </div>
  );
}

export function DualBatteryChart() {
  const { configured } = useSimulationResult();
  const [showTable, setShowTable] = useState(false);

  const pluggedInIntervals = useMemo(
    () => findPluggedInIntervals(configured.hourlyStates),
    [configured.hourlyStates]
  );

  return (
    <figure
      className="rounded-lg border p-4"
      style={{ backgroundColor: "var(--chart-surface)", borderColor: "var(--chart-border)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5" style={{ color: "var(--chart-text-primary)" }}>
          <BatteryCharging className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-semibold">Battery State of Charge</span>
        </div>
        {/* The table-view toggle is this chart's accessibility twin — every
         * value shown in the chart is also reachable here without needing to
         * hover anything. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          style={{ color: "var(--chart-text-secondary)", borderColor: "var(--chart-border)" }}
        >
          {showTable ? (
            <>
              <LineChartIcon className="h-3.5 w-3.5" aria-hidden="true" /> View as chart
            </>
          ) : (
            <>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> View as table
            </>
          )}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-y-auto rounded-md border" style={{ borderColor: "var(--chart-border)" }}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: "var(--chart-surface)" }}>
              <tr>
                <th className="px-2 py-1 font-medium">Hour</th>
                <th className="px-2 py-1 font-medium">Period</th>
                <th className="px-2 py-1 font-medium tabular-nums">Stationary SoC</th>
                <th className="px-2 py-1 font-medium tabular-nums">EV SoC</th>
                <th className="px-2 py-1 font-medium">EV Status</th>
              </tr>
            </thead>
            <tbody>
              {configured.hourlyStates.map((state) => (
                <tr key={state.hour} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
                  <td className="px-2 py-1 tabular-nums">{formatHour(state.hour)}</td>
                  <td className="px-2 py-1">{state.period}</td>
                  <td className="px-2 py-1 tabular-nums">{Math.round(state.stationarySocPct)}%</td>
                  <td className="px-2 py-1 tabular-nums">{Math.round(state.evSocPct)}%</td>
                  <td className="px-2 py-1">{state.evPluggedIn ? "Plugged in" : "Away"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={configured.hourlyStates} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />

              {pluggedInIntervals.map((interval, index) => (
                <ReferenceArea
                  key={index}
                  x1={interval.x1}
                  x2={interval.x2}
                  fill="var(--chart-muted)"
                  fillOpacity={0.12}
                  stroke="none"
                />
              ))}

              <XAxis
                dataKey="hour"
                type="number"
                domain={[-0.5, 23.5]}
                ticks={X_AXIS_TICKS}
                tickFormatter={(hour: number) => formatHourShort(hour)}
                stroke="var(--chart-baseline)"
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(pct: number) => `${pct}%`}
                stroke="var(--chart-baseline)"
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                width={40}
              />

              <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--chart-baseline)" }} />

              <Line
                type="monotone"
                dataKey="stationarySocPct"
                name="Stationary Battery"
                stroke="var(--chart-series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="evSocPct"
                name="EV Battery"
                stroke="var(--chart-series-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Custom legend, built in plain HTML rather than Recharts' default
           * <Legend/>, so the "EV plugged in" band can appear as a third key
           * alongside the two real data series without pretending to be one. */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--chart-text-secondary)" }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-series-1)" }} />
              Stationary Battery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-series-2)" }} />
              EV Battery
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-4 rounded-sm"
                style={{ backgroundColor: "var(--chart-muted)", opacity: 0.3 }}
              />
              EV plugged in
            </span>
          </div>
        </>
      )}
    </figure>
  );
}
