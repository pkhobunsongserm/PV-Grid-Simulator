// -----------------------------------------------------------------------------
// components/controls/BatteryControls.tsx
//
// Sliders for the STATIONARY (fixed, in-the-garage) home battery — its size and
// how full it starts the day. The Reserve SoC slider is deliberately NOT in
// here — see components/controls/ReserveSocSlider.tsx and README.md's "Locked
// decisions" #4 for why it's kept as its own, separately-labeled section
// instead of looking like just another battery setting.
// -----------------------------------------------------------------------------
"use client";

import { BatteryCharging } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { SliderField } from "./SliderField";
import { formatPercent } from "@/lib/format";

export function BatteryControls() {
  const battery = useSimulationStore((state) => state.inputs.battery);
  const setBattery = useSimulationStore((state) => state.setBattery);

  return (
    <ControlSection
      title="Stationary Battery"
      icon={BatteryCharging}
      description="The fixed home battery. Max charge/discharge rate is fixed at 10kW, per spec."
    >
      <SliderField
        label="Capacity"
        value={battery.capacityKwh}
        min={0}
        max={30}
        step={0.5}
        onChange={(capacityKwh) => setBattery({ capacityKwh })}
        formatValue={(v) => `${v.toFixed(1)} kWh`}
      />
      <SliderField
        label="Starting Charge"
        value={battery.startingSocPct}
        min={0}
        max={100}
        onChange={(startingSocPct) => setBattery({ startingSocPct })}
        formatValue={formatPercent}
        helpText="How full the battery is at the start of the simulated day (midnight)."
      />
    </ControlSection>
  );
}
