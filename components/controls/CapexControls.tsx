// -----------------------------------------------------------------------------
// components/controls/CapexControls.tsx
//
// Cost assumptions used by the payback calculation. These weren't part of the
// original feature spec at all — the spec had no way to say "how much does a
// battery cost per kWh?" — so they were added with sensible defaults (see
// lib/constants.ts's DEFAULT_CAPEX and README.md "Locked decisions" #9).
// Collapsed by default (defaultOpen={false}): most people will never need to
// touch these, so they're tucked away under "Advanced" rather than cluttering
// the main sidebar.
// -----------------------------------------------------------------------------
"use client";

import { DollarSign } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { SliderField } from "./SliderField";
import { formatAud } from "@/lib/format";

export function CapexControls() {
  const capex = useSimulationStore((state) => state.inputs.capex);
  const setCapex = useSimulationStore((state) => state.setCapex);

  return (
    <ControlSection
      title="Advanced: Cost Assumptions"
      icon={DollarSign}
      description="Not part of the original spec — added so the payback math has real numbers. See README.md #9."
      defaultOpen={false}
    >
      <SliderField
        label="Battery Cost"
        value={capex.batteryCostPerKwh}
        min={300}
        max={2000}
        step={10}
        onChange={(batteryCostPerKwh) => setCapex({ batteryCostPerKwh })}
        formatValue={(v) => `${formatAud(v)}/kWh`}
      />
      <SliderField
        label="Solar Cost"
        value={capex.solarCostPerKw}
        min={500}
        max={3000}
        step={10}
        onChange={(solarCostPerKw) => setCapex({ solarCostPerKw })}
        formatValue={(v) => `${formatAud(v)}/kW`}
      />
      <SliderField
        label="V2G Charger Cost"
        value={capex.v2gChargerFixedCost}
        min={2000}
        max={20000}
        step={100}
        onChange={(v2gChargerFixedCost) => setCapex({ v2gChargerFixedCost })}
        formatValue={(v) => `${formatAud(v)} flat`}
        helpText="A FLAT cost, not priced per kW — real V2G chargers are dominated by fixed hardware cost, not power rating."
      />
    </ControlSection>
  );
}
