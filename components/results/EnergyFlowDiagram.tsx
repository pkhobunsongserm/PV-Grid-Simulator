// -----------------------------------------------------------------------------
// components/results/EnergyFlowDiagram.tsx
//
// A scrubbable, hour-by-hour snapshot of exactly where power is coming from
// and going to: Solar, Home, Stationary Battery, EV, and Grid.
//
// WHY HAND-DRAWN SVG, NOT A DIAGRAM LIBRARY (e.g. d3-sankey, react-flow): the
// shape of this diagram never changes — it's always the same 5 boxes with a
// fixed set of possible connections between them. A general-purpose flow/
// Sankey library is built to handle diagrams whose topology varies at
// runtime; ours doesn't, so pulling one in would add a dependency (and its
// own theming/sizing quirks) to solve a problem we don't have. Five
// positioned boxes and a handful of SVG <path> lines is simpler and easier to
// reason about than configuring a library to draw exactly this one thing.
//
// WHY THE COLORS ARE 3 CATEGORICAL HUES + 1 NEUTRAL GRAY, NOT 4 HUES: a flow
// on this diagram is colored by whichever node is SOURCING it (so every
// Solar-sourced flow — to Home, to Battery, to EV, or to Grid — is the same
// green, no matter where it ends up). That's naturally 4 possible source
// identities (Solar/Battery/EV/Grid). But this project's data-visualization
// validator (see app/globals.css's comment on --chart-series-3) confirmed
// that 4 categorical hues fail its colorblind-safety check for diagrams where
// any two colored marks might sit right next to each other (which can
// genuinely happen here — e.g. an EV-to-Home flow and a Grid-to-Home flow
// both active in the same hour). Rather than ship 4 colors that fail that
// check, Grid uses the same neutral gray as the Dual-Battery chart's
// "EV plugged in" band: it's a legitimate choice, not just a workaround —
// Grid is the fallback/utility source, not a "microgrid asset" you're meant
// to visually track as a peer of Solar/Battery/EV.
// -----------------------------------------------------------------------------
"use client";

import { useMemo, useState } from "react";
import { Sun, Home as HomeIcon, BatteryCharging, Car, Zap, Table2, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSimulationResult } from "@/hooks/useSimulationResult";
import { TimeSlider } from "./TimeSlider";
import { formatHour } from "@/lib/format";
import type { HourlyState } from "@/lib/types";

// ---- Layout: fixed pixel positions in a 480x400 viewBox --------------------
// Solar sits above Home; Battery/Grid/EV sit in a row below Home. Every edge
// EXCEPT Solar→Grid is a straight line between two nodes that aren't
// otherwise obstructed. Solar and Grid happen to share the same x position
// (both directly above/below Home), so that one edge is drawn as a curve
// bowing right, specifically so it doesn't visually cut through the Home box
// sitting directly between them.
//
// The vertical gaps here are deliberately generous (170px Solar-Home, 150px
// Home-row) — an earlier, more compact layout trimmed so much off each end
// for the arrowhead that short edges (Solar-Home, Home-Grid) shrank to a
// couple of visible pixels, reading as a stray mark rather than a line.
const NODE_RADIUS = 46; // how far each edge is trimmed back from a node's
// center point, so arrowheads land just outside the node box instead of
// disappearing underneath it (nodes are drawn on top of edges).

interface NodeDef {
  x: number;
  y: number;
  icon: LucideIcon;
  label: string;
}

const NODES = {
  solar: { x: 240, y: 40, icon: Sun, label: "Solar" },
  home: { x: 240, y: 210, icon: HomeIcon, label: "Home" },
  battery: { x: 90, y: 360, icon: BatteryCharging, label: "Battery" },
  grid: { x: 240, y: 360, icon: Zap, label: "Grid" },
  ev: { x: 390, y: 360, icon: Car, label: "EV" },
} satisfies Record<string, NodeDef>;

type NodeId = keyof typeof NODES;

interface FlowDefinition {
  id: string;
  from: NodeId;
  to: NodeId;
  label: string;
  colorVar: string;
  /** Pulls the value for this specific flow out of a hour's simulation
   * state. Most of these read a field straight off HourlyState; "Solar →
   * Home" is the one exception — that value isn't stored directly (the
   * engine only tracks solar's SURPLUS after home use), so it's derived as
   * whichever is smaller of solar generated and demand that hour. */
  getKw: (state: HourlyState) => number;
}

const FLOW_DEFINITIONS: FlowDefinition[] = [
  {
    id: "solar-home",
    from: "solar",
    to: "home",
    label: "Solar → Home",
    colorVar: "var(--chart-series-3)",
    getKw: (s) => Math.min(s.solarKw, s.demandKw),
  },
  {
    id: "solar-battery",
    from: "solar",
    to: "battery",
    label: "Solar → Battery",
    colorVar: "var(--chart-series-3)",
    getKw: (s) => s.stationaryChargeKw,
  },
  {
    id: "solar-ev",
    from: "solar",
    to: "ev",
    label: "Solar → EV",
    colorVar: "var(--chart-series-3)",
    getKw: (s) => s.evChargeKw,
  },
  {
    id: "solar-grid",
    from: "solar",
    to: "grid",
    label: "Solar → Grid",
    colorVar: "var(--chart-series-3)",
    getKw: (s) => s.gridExportKw,
  },
  {
    id: "battery-home",
    from: "battery",
    to: "home",
    label: "Battery → Home",
    colorVar: "var(--chart-series-1)",
    getKw: (s) => s.stationaryDischargeKw,
  },
  {
    id: "ev-home",
    from: "ev",
    to: "home",
    label: "EV → Home",
    colorVar: "var(--chart-series-2)",
    getKw: (s) => s.evDischargeKw,
  },
  {
    id: "grid-home",
    from: "grid",
    to: "home",
    label: "Grid → Home",
    colorVar: "var(--chart-muted)",
    getKw: (s) => s.gridImportKw,
  },
];

/** Stroke width scales with flow magnitude, capped at both ends so a tiny
 * trickle is still visible and a huge flow doesn't swallow the diagram.
 * REFERENCE_MAX_KW is a fixed (not hour-relative) denominator, so a 5kW flow
 * always renders at the same thickness no matter what else is happening that
 * hour — hour-to-hour comparisons stay honest. */
const MIN_STROKE = 2;
const MAX_STROKE = 10;
const REFERENCE_MAX_KW = 15;
function strokeWidthForKw(kw: number): number {
  const ratio = Math.min(1, kw / REFERENCE_MAX_KW);
  return MIN_STROKE + ratio * (MAX_STROKE - MIN_STROKE);
}

/** Builds the trimmed SVG path + label position for one flow, given the two
 * node endpoints. Every edge is a straight line except Solar→Grid, which
 * curves around the Home node sitting directly between them. */
function buildPath(from: NodeId, to: NodeId): { d: string; labelX: number; labelY: number } {
  const a = NODES[from];
  const b = NODES[to];

  if (from === "solar" && to === "grid") {
    // Hand-placed curve: starts just right of Solar, bows out through a
    // control point well clear of Home, ends just above Grid.
    const start = { x: a.x + 30, y: a.y + 34 };
    const end = { x: b.x + 30, y: b.y - 34 };
    const control = { x: 380, y: 200 };
    return {
      d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      labelX: control.x - 6,
      labelY: control.y,
    };
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: a.x + ux * NODE_RADIUS, y: a.y + uy * NODE_RADIUS };
  const end = { x: b.x - ux * NODE_RADIUS, y: b.y - uy * NODE_RADIUS };
  return {
    d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  };
}

export function EnergyFlowDiagram() {
  const { configured } = useSimulationResult();
  // Noon is a fixed, deterministic default (not "the current real-world
  // hour") so server-rendered and client-rendered markup always match on
  // first load — using the visitor's actual clock time here would risk a
  // hydration mismatch between server and browser.
  const [selectedHour, setSelectedHour] = useState(12);
  const [showTable, setShowTable] = useState(false);

  const state = configured.hourlyStates[selectedHour];

  const activeFlows = useMemo(
    () =>
      FLOW_DEFINITIONS.map((def) => ({ def, kw: def.getKw(state) })).filter(({ kw }) => kw > 0.01),
    [state]
  );

  return (
    <figure
      className="rounded-lg border p-4"
      style={{ backgroundColor: "var(--chart-surface)", borderColor: "var(--chart-border)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5" style={{ color: "var(--chart-text-primary)" }}>
          <Workflow className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-semibold">Energy Flow Diagram</span>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          style={{ color: "var(--chart-text-secondary)", borderColor: "var(--chart-border)" }}
        >
          {showTable ? (
            <>
              <Workflow className="h-3.5 w-3.5" aria-hidden="true" /> View as diagram
            </>
          ) : (
            <>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> View as table
            </>
          )}
        </button>
      </div>

      <div className="mb-3">
        <TimeSlider hour={selectedHour} onChange={setSelectedHour} period={state.period} />
      </div>

      {showTable ? (
        <FlowTable hourlyStates={configured.hourlyStates} />
      ) : (
        <>
          <svg viewBox="0 0 480 400" className="w-full" role="img" aria-label={`Energy flows at ${formatHour(selectedHour)}`}>
            <defs>
              {["var(--chart-series-1)", "var(--chart-series-2)", "var(--chart-series-3)", "var(--chart-muted)"].map(
                (colorVar) => (
                  <marker
                    key={colorVar}
                    id={`arrow-${colorVar.replace(/[^a-z0-9]/gi, "")}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={colorVar} />
                  </marker>
                )
              )}
            </defs>

            {/* Edges are drawn BEFORE nodes, so each line's trimmed endpoint
             * disappears cleanly under the opaque node box it connects to,
             * while the arrowhead (placed just outside the box via
             * NODE_RADIUS trimming) stays visible. */}
            {activeFlows.map(({ def, kw }) => {
              const { d, labelX, labelY } = buildPath(def.from, def.to);
              const markerId = `arrow-${def.colorVar.replace(/[^a-z0-9]/gi, "")}`;
              return (
                <g key={def.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={def.colorVar}
                    strokeWidth={strokeWidthForKw(kw)}
                    strokeLinecap="round"
                    markerEnd={`url(#${markerId})`}
                  />
                  <rect
                    x={labelX - 24}
                    y={labelY - 10}
                    width={48}
                    height={18}
                    rx={4}
                    fill="var(--chart-surface)"
                    stroke="var(--chart-border)"
                  />
                  <text
                    x={labelX}
                    y={labelY + 3}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--chart-text-primary)"
                  >
                    {kw.toFixed(1)} kW
                  </text>
                </g>
              );
            })}

            {(Object.keys(NODES) as NodeId[]).map((id) => {
              const node = NODES[id];
              const Icon = node.icon;
              return (
                <g key={id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    x={-52}
                    y={-26}
                    width={104}
                    height={52}
                    rx={10}
                    fill="var(--chart-surface)"
                    stroke="var(--chart-border)"
                  />
                  <foreignObject x={-52} y={-26} width={104} height={52}>
                    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
                      <Icon className="h-4 w-4" style={{ color: "var(--chart-text-primary)" }} aria-hidden="true" />
                      <span className="text-xs font-medium" style={{ color: "var(--chart-text-primary)" }}>
                        {node.label}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

          {activeFlows.length === 0 && (
            <p className="text-center text-xs" style={{ color: "var(--chart-muted)" }}>
              No power is flowing this hour in the current configuration.
            </p>
          )}

          {/* Custom legend, plain HTML, per the project's line-key convention
           * (a short stroke, not a filled box) — see DualBatteryChart.tsx for
           * the same pattern. */}
          <div
            className="mt-2 flex flex-wrap items-center gap-4 text-xs"
            style={{ color: "var(--chart-text-secondary)" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-series-3)" }} />
              Solar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-series-1)" }} />
              Battery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-series-2)" }} />
              EV
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "var(--chart-muted)" }} />
              Grid (fallback source, not a sized asset)
            </span>
          </div>
        </>
      )}
    </figure>
  );
}

/** The diagram's accessibility twin: every flow, for every hour, as a plain
 * table — not just the currently-scrubbed hour, so a reader using this view
 * has access to everything the diagram could show across the full day. */
function FlowTable({ hourlyStates }: { hourlyStates: HourlyState[] }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border" style={{ borderColor: "var(--chart-border)" }}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0" style={{ backgroundColor: "var(--chart-surface)" }}>
          <tr>
            <th className="px-2 py-1 font-medium">Hour</th>
            {FLOW_DEFINITIONS.map((def) => (
              <th key={def.id} className="px-2 py-1 font-medium tabular-nums">
                {def.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hourlyStates.map((state) => (
            <tr key={state.hour} className="border-t" style={{ borderColor: "var(--chart-grid)" }}>
              <td className="px-2 py-1 tabular-nums">{formatHour(state.hour)}</td>
              {FLOW_DEFINITIONS.map((def) => {
                const kw = def.getKw(state);
                return (
                  <td key={def.id} className="px-2 py-1 tabular-nums">
                    {kw > 0.01 ? `${kw.toFixed(1)} kW` : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
