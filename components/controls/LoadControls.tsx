// -----------------------------------------------------------------------------
// components/controls/LoadControls.tsx
//
// Household demand sliders: total daily usage, and what fraction of that is
// "critical" (must stay powered during a blackout). The Critical Load %
// slider has a special quirk explained in README.md "Locked decisions" #2:
// by default the app uses the reference data's own realistic per-hour critical
// -load shape, but the MOMENT this slider is touched, the app switches to a
// flat "this hour's demand × your chosen %" formula instead. That's a
// deliberate, documented behavior change — not a bug — so this component shows
// a small note explaining which mode is currently active, plus a way to go
// back to the default shape.
// -----------------------------------------------------------------------------
"use client";

import { Home } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { SliderField } from "./SliderField";
import { DEFAULT_SIMULATION_INPUTS } from "@/lib/constants";

export function LoadControls() {
  const load = useSimulationStore((state) => state.inputs.load);
  const setLoad = useSimulationStore((state) => state.setLoad);

  return (
    <ControlSection
      title="Household Demand"
      icon={Home}
      description="Scales the reference demand curve proportionally — see README.md."
    >
      <SliderField
        label="Base Load"
        value={load.dailyKwh}
        min={5}
        max={40}
        step={0.1}
        onChange={(dailyKwh) => setLoad({ dailyKwh })}
        formatValue={(v) => `${v.toFixed(1)} kWh/day`}
      />
      <SliderField
        label="Critical Load %"
        // Stored internally as a 0-1 fraction (e.g. 0.3), but shown here as a
        // whole-number percentage (30), matching how every other percentage
        // slider in this app is displayed.
        value={Math.round(load.criticalLoadPct * 100)}
        min={0}
        max={100}
        onChange={(newPct) =>
          setLoad({ criticalLoadPct: newPct / 100, criticalLoadPctIsOverridden: true })
        }
        formatValue={(v) => `${v}%`}
        helpText={
          load.criticalLoadPctIsOverridden
            ? "Using a flat percentage of demand for every hour (your override)."
            : "Using the reference data's real per-hour shape (default) — touching this slider switches to a flat percentage instead."
        }
      />
      {load.criticalLoadPctIsOverridden && (
        <button
          type="button"
          onClick={() =>
            setLoad({
              criticalLoadPct: DEFAULT_SIMULATION_INPUTS.load.criticalLoadPct,
              criticalLoadPctIsOverridden: false,
            })
          }
          className="text-xs text-emerald-600 underline underline-offset-2"
        >
          Reset to reference data&apos;s shape
        </button>
      )}
    </ControlSection>
  );
}
