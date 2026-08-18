// -----------------------------------------------------------------------------
// components/controls/EVControls.tsx
//
// Every slider/dropdown related to the EV and its bidirectional (V2G) charger:
// size, charger speed, discharge floor, starting charge, commute schedule, and
// daily commute energy use. See README.md "Locked decisions" #4 for why the
// EV Discharge Floor behaves differently from the Stationary Reserve SoC
// slider (in ReserveSocSlider.tsx) even though they look like similar kinds of
// controls.
// -----------------------------------------------------------------------------
"use client";

import { Car, TriangleAlert } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { SliderField } from "./SliderField";
import { HourSelect } from "./HourSelect";
import { formatPercent } from "@/lib/format";

export function EVControls() {
  const ev = useSimulationStore((state) => state.inputs.ev);
  const setEV = useSimulationStore((state) => state.setEV);

  return (
    <ControlSection
      title="EV & V2G Configuration"
      icon={Car}
      description="Your electric vehicle and its bidirectional charger."
    >
      <SliderField
        label="EV Battery Capacity"
        value={ev.capacityKwh}
        min={40}
        max={100}
        onChange={(capacityKwh) => setEV({ capacityKwh })}
        formatValue={(v) => `${v} kWh`}
      />
      <SliderField
        label="V2G Charger Power"
        value={ev.chargerPowerKw}
        min={3.3}
        max={11}
        step={0.1}
        onChange={(chargerPowerKw) => setEV({ chargerPowerKw })}
        formatValue={(v) => `${v.toFixed(1)} kW`}
      />
      <SliderField
        label="EV Discharge Floor"
        value={ev.dischargeFloorPct}
        min={20}
        max={50}
        onChange={(dischargeFloorPct) => setEV({ dischargeFloorPct })}
        formatValue={formatPercent}
        helpText="The EV never discharges below this line — not even during a simulated blackout — to protect enough charge to actually drive somewhere."
      />
      <SliderField
        label="Starting Charge"
        value={ev.startingSocPct}
        min={0}
        max={100}
        onChange={(startingSocPct) => setEV({ startingSocPct })}
        formatValue={formatPercent}
        helpText="How full the EV is at the start of the simulated day."
      />
      <HourSelect
        label="Departure Time"
        value={ev.departureHour}
        onChange={(departureHour) => setEV({ departureHour })}
        helpText="When the EV leaves for its daily commute and becomes unavailable to the house."
      />
      <HourSelect
        label="Arrival Time"
        value={ev.arrivalHour}
        onChange={(arrivalHour) => setEV({ arrivalHour })}
        helpText="When the EV returns home and becomes available again."
      />
      {/* A basic input-validation guard, not a hard block — Departure ==
       * Arrival is a legal value (isEvAway() in lib/v2g-simulation.ts
       * deliberately treats it as "EV never home," see README.md #5), but
       * it's very easy to land on by accident while dragging two separate
       * dropdowns, and the resulting behavior (EV never charges, never
       * discharges, never helps in a blackout) is easy to misread as a bug
       * rather than the direct consequence of this specific setting. */}
      {ev.departureHour === ev.arrivalHour && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          role="status"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Departure and Arrival are set to the same hour — the EV will be treated as
            never home, so it won&apos;t charge, discharge, or help during a blackout.
          </span>
        </div>
      )}
      <SliderField
        label="Daily Commute Energy"
        value={ev.dailyCommuteKwh}
        min={5}
        max={30}
        onChange={(dailyCommuteKwh) => setEV({ dailyCommuteKwh })}
        formatValue={(v) => `${v} kWh`}
        helpText="Deducted from the EV's charge once, at departure — a single round-trip total."
      />
    </ControlSection>
  );
}
