// -----------------------------------------------------------------------------
// lib/presets.ts
//
// Three ready-made starting configurations, so a first-time user doesn't have to
// set 15 sliders by hand to see something meaningful. Each preset only lists the
// values it wants to be DIFFERENT from the app's normal defaults
// (DEFAULT_SIMULATION_INPUTS in lib/constants.ts) — buildPresetInputs() below
// fills in everything else.
//
// This file has no UI code either — it just describes data. A later phase will
// wire a "PresetSelector" component up to call buildPresetInputs() and hand the
// result to the Zustand store.
// -----------------------------------------------------------------------------

import { DEFAULT_SIMULATION_INPUTS } from "./constants";
import type { PresetConfig, SimulationInputs } from "./types";

export const PRESETS: PresetConfig[] = [
  {
    id: "commuter-ev",
    label: "Commuter EV",
    description:
      "A typical suburban household with a standard daily commute. Modest solar " +
      "and battery sizing, an EV that's away for a normal 8am-6pm work day. This " +
      "is the app's baseline, everyday scenario.",
    // Empty overrides on purpose — this preset simply reuses the app's defaults,
    // which are already tuned to represent this "typical household" case.
    inputs: {},
  },
  {
    id: "off-grid-heavy",
    label: "Off-Grid Heavy",
    description:
      "Prioritizes surviving a long blackout over minimizing cost: a large " +
      "stationary battery kept mostly full, a bigger EV with a fast charger and a " +
      "low discharge floor (so more of its battery is available to help power " +
      "the house), and enough solar to recharge everything quickly.",
    inputs: {
      battery: {
        capacityKwh: 30, // the maximum the spec allows — biggest available backup pool
        reserveSocPct: 60, // keep most of it in reserve for an outage, not arbitrage
        startingSocPct: 60, // matches reserveSocPct, per README #10
      },
      ev: {
        capacityKwh: 100, // the maximum the spec allows
        chargerPowerKw: 11, // the fastest V2G charger the spec allows
        dischargeFloorPct: 20, // the lowest floor allowed — makes more of the EV's
        // battery available to help during an outage, at the cost of less
        // reserved driving range
      },
      solar: {
        capacityKw: 20, // the maximum the spec allows, to recharge both batteries
        // as fast as possible on a normal day
      },
    },
  },
  {
    id: "solar-max",
    label: "Solar Max",
    description:
      "Prioritizes financial payback: a large solar system to maximize free " +
      "self-consumption and export revenue, paired with a modestly-sized battery " +
      "kept at a low reserve so more of it is available for everyday cost " +
      "arbitrage rather than sitting idle as backup.",
    inputs: {
      solar: {
        capacityKw: 20, // the maximum the spec allows — more free power to use or sell
      },
      battery: {
        capacityKwh: 13.5, // a common real-world home battery size
        reserveSocPct: 10, // keep only a small safety margin — the goal here is
        // savings, not backup capacity
        startingSocPct: 10, // matches reserveSocPct, per README #10
      },
    },
  },
];

/**
 * Turns a preset's (partial) overrides into a complete, ready-to-use
 * SimulationInputs object by layering them on top of DEFAULT_SIMULATION_INPUTS.
 * Each section (battery, ev, solar, load, capex) is merged independently, so a
 * preset that only wants to change e.g. battery.reserveSocPct doesn't
 * accidentally reset the rest of the battery settings back to their defaults.
 */
export function buildPresetInputs(preset: PresetConfig): SimulationInputs {
  return {
    battery: { ...DEFAULT_SIMULATION_INPUTS.battery, ...preset.inputs.battery },
    ev: { ...DEFAULT_SIMULATION_INPUTS.ev, ...preset.inputs.ev },
    solar: { ...DEFAULT_SIMULATION_INPUTS.solar, ...preset.inputs.solar },
    load: { ...DEFAULT_SIMULATION_INPUTS.load, ...preset.inputs.load },
    capex: { ...DEFAULT_SIMULATION_INPUTS.capex, ...preset.inputs.capex },
    blackoutStartHour: preset.inputs.blackoutStartHour ?? DEFAULT_SIMULATION_INPUTS.blackoutStartHour,
  };
}
