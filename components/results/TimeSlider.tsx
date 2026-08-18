// -----------------------------------------------------------------------------
// components/results/TimeSlider.tsx
//
// A plain "scrub through the 24 simulated hours" control, used by the Energy
// Flow Diagram. Deliberately NOT built on SliderField (the sidebar's shared
// slider) — this one controls which hour of the ALREADY-COMPUTED simulation
// result to look at, not a simulation input itself. Its value never touches
// the Zustand store; it's plain component state owned by whichever component
// renders it (see EnergyFlowDiagram.tsx).
// -----------------------------------------------------------------------------
"use client";

import { formatHour } from "@/lib/format";
import type { TariffHourEntry } from "@/lib/types";

interface TimeSliderProps {
  hour: number;
  onChange: (hour: number) => void;
  period: TariffHourEntry["period"];
}

export function TimeSlider({ hour, onChange, period }: TimeSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-24 shrink-0 text-sm font-medium tabular-nums"
        style={{ color: "var(--chart-text-primary)" }}
      >
        {formatHour(hour)}
      </span>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={hour}
        onChange={(event) => onChange(Number(event.target.value))}
        // min-w-0 overrides a flex item's default `min-width: auto`, which
        // otherwise refuses to let a range input shrink below its browser
        // default width — without it, this row quietly forced the whole
        // page a few pixels wider than the viewport on narrow (mobile)
        // screens, since flex-1 alone doesn't override that default.
        className="h-2 min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: "var(--chart-series-3)" }}
        aria-label="Hour of day to inspect"
      />
      <span
        className="w-28 shrink-0 text-right text-xs"
        style={{ color: "var(--chart-text-secondary)" }}
      >
        {period}
      </span>
    </div>
  );
}
