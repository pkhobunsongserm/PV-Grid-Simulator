// -----------------------------------------------------------------------------
// components/controls/BlackoutStartControl.tsx
//
// Sets WHEN the simulated grid blackout begins. This single value feeds both
// the Executive Summary's resilience card AND the Sensitivity Matrix table —
// deliberately shared rather than each having its own setting, so the two
// never quietly disagree about what "the outage" means. See README.md
// "Locked decisions" #6.
// -----------------------------------------------------------------------------
"use client";

import { ZapOff } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { HourSelect } from "./HourSelect";

export function BlackoutStartControl() {
  const blackoutStartHour = useSimulationStore((state) => state.inputs.blackoutStartHour);
  const setBlackoutStartHour = useSimulationStore((state) => state.setBlackoutStartHour);

  return (
    <ControlSection
      title="Outage Simulator"
      icon={ZapOff}
      description="Shared by the resilience card and the sensitivity matrix — both always agree on this."
    >
      <HourSelect
        label="Blackout Start Time"
        value={blackoutStartHour}
        onChange={setBlackoutStartHour}
        helpText="Only critical loads are served from this hour onward. No grid, no solar recharging."
      />
    </ControlSection>
  );
}
