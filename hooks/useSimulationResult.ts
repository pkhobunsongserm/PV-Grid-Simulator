// -----------------------------------------------------------------------------
// hooks/useSimulationResult.ts
//
// A "hook" is just a function (its name has to start with `use`) that a React
// component can call to get access to some capability — reading shared state,
// running a calculation, etc. This one is the bridge between the Zustand store
// (store/useSimulationStore.ts, which only holds raw slider values) and the
// actual simulation engine (lib/v2g-simulation.ts, which has no idea React or
// Zustand exist). Any component that needs "the current simulation results"
// calls this hook instead of running the engine itself.
// -----------------------------------------------------------------------------

import { useMemo } from "react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { runFullSimulation, type FullSimulationOutput } from "@/lib/v2g-simulation";
import { tariffSchedule, referenceSolarProfile, referenceHouseholdLoad } from "@/lib/reference-data";

/**
 * Returns the full simulation result (24-hour dispatch, baseline comparison,
 * financials, and both outage-survival numbers) for whatever the sliders are
 * CURRENTLY set to.
 *
 * `useMemo` here means "only actually re-run the simulation if `inputs`
 * changed since last time — otherwise just hand back the same result object
 * from before." Without it, every component that calls this hook would
 * silently re-run the entire 24-hour simulation on every single render (which
 * can happen for reasons unrelated to the sliders, like a parent component
 * re-rendering) instead of only when a slider actually moved.
 */
export function useSimulationResult(): FullSimulationOutput {
  const inputs = useSimulationStore((state) => state.inputs);

  return useMemo(
    () => runFullSimulation(inputs, tariffSchedule, referenceSolarProfile, referenceHouseholdLoad),
    [inputs]
  );
}
