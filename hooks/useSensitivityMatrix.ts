// -----------------------------------------------------------------------------
// hooks/useSensitivityMatrix.ts
//
// Same idea as hooks/useSimulationResult.ts, but for the Sensitivity Matrix
// Table instead of the main results — it runs runSensitivityMatrix() (which
// internally re-runs the full simulation once per grid cell, 63 times by
// default) and caches the result with useMemo so that only happens when the
// sliders actually change, not on every unrelated re-render.
// -----------------------------------------------------------------------------

import { useMemo } from "react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { runSensitivityMatrix } from "@/lib/v2g-simulation";
import { tariffSchedule, referenceSolarProfile, referenceHouseholdLoad } from "@/lib/reference-data";
import type { SensitivityMatrixCell } from "@/lib/types";

/** Returns the current Reserve SoC × Stationary Capacity grid of payback/
 * survival outcomes, recalculated whenever the sliders change. */
export function useSensitivityMatrix(): SensitivityMatrixCell[][] {
  const inputs = useSimulationStore((state) => state.inputs);

  return useMemo(
    () => runSensitivityMatrix(inputs, tariffSchedule, referenceSolarProfile, referenceHouseholdLoad),
    [inputs]
  );
}
