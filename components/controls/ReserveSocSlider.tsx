// -----------------------------------------------------------------------------
// components/controls/ReserveSocSlider.tsx
//
// The Stationary Reserve SoC slider — kept in its own section, separate from
// BatteryControls.tsx, because it behaves asymmetrically from every other
// battery setting: it's a hard floor ONLY during normal, day-to-day operation.
// During an actual simulated blackout, the battery drains straight through it
// down to 0%, since the reserve's entire purpose is to be available for that
// moment. See README.md "Locked decisions" #4 for the full explanation, and
// compare with the EV Discharge Floor in EVControls.tsx, which behaves the
// opposite way (it stays a hard floor even during a blackout).
// -----------------------------------------------------------------------------
"use client";

import { ShieldCheck } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { SliderField } from "./SliderField";
import { formatPercent } from "@/lib/format";

export function ReserveSocSlider() {
  const reserveSocPct = useSimulationStore((state) => state.inputs.battery.reserveSocPct);
  const setBattery = useSimulationStore((state) => state.setBattery);

  return (
    <ControlSection
      title="Stationary Reserve SoC"
      icon={ShieldCheck}
      description="Locked for grid-outage backup — not the same kind of setting as the EV's discharge floor below."
    >
      <SliderField
        label="Reserve SoC"
        value={reserveSocPct}
        min={0}
        max={80}
        onChange={(newReserveSocPct) => setBattery({ reserveSocPct: newReserveSocPct })}
        formatValue={formatPercent}
        helpText="During a normal day, the battery won't discharge below this line. During a simulated blackout, it drains all the way to 0% — the reserve IS the backup."
      />
    </ControlSection>
  );
}
