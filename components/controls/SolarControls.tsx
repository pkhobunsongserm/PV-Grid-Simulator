// -----------------------------------------------------------------------------
// components/controls/SolarControls.tsx
//
// A single slider for solar system size. Behind the scenes, changing this
// doesn't edit the reference solar data — it scales a COPY of it
// proportionally (see scaleReferenceData() in lib/v2g-simulation.ts and
// README.md "Locked decisions" #2), so the shape of the generation curve
// through the day stays realistic at any size.
// -----------------------------------------------------------------------------
"use client";

import { Sun } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { InfoLink } from "@/components/common/InfoLink";
import { SliderField } from "./SliderField";

export function SolarControls() {
  const solar = useSimulationStore((state) => state.inputs.solar);
  const setSolar = useSimulationStore((state) => state.setSolar);

  return (
    <ControlSection
      title="Solar PV"
      icon={Sun}
      description={
        <>
          Scales one reference system&apos;s generation curve proportionally, inverter limit
          included. <InfoLink id="scaling" />
        </>
      }
    >
      <SliderField
        label="Solar Capacity"
        value={solar.capacityKw}
        min={0}
        max={20}
        step={0.1}
        onChange={(capacityKw) => setSolar({ capacityKw })}
        formatValue={(v) => `${v.toFixed(1)} kW`}
      />
    </ControlSection>
  );
}
