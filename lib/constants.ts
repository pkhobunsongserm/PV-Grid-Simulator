// -----------------------------------------------------------------------------
// lib/constants.ts
//
// Fixed numbers used by the simulation engine and the UI that aren't meant to be
// changed by the user (unlike the slider values in lib/types.ts's
// SimulationInputs). Keeping them here, in one place with explanations, means
// nobody has to go hunting through the engine code to find out "why is this
// number 10?" or "where did $900 come from?".
// -----------------------------------------------------------------------------

import type { SimulationInputs } from "./types";

/** The stationary battery's maximum charge/discharge rate, in kW. Fixed at 10kW
 * per the original feature spec (independent of the battery's capacityKwh
 * slider, which only controls how much energy it can hold, not how fast). */
export const STATIONARY_BATTERY_MAX_RATE_KW = 10;

/** Safety cap on how many hours the outage simulator will simulate forward before
 * giving up and reporting "Infinite" instead of a specific number. 168 hours = 1
 * week. Without a cap, a heavily-oversized system with very low critical load
 * could make the simulation loop run for an unreasonably (or even infinitely)
 * long simulated time. See README.md "Locked decisions" #6. */
export const OUTAGE_SIMULATION_CAP_HOURS = 168;

/** The row values (Reserve SoC %) used to build the Sensitivity Matrix. Chosen as
 * clean round numbers spanning the full 0-80% slider range, rather than forcing
 * an arbitrary "8 evenly spaced" split that wouldn't land on round percentages. */
export const SENSITIVITY_RESERVE_SOC_STEPS_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80];

/** The column values (Stationary Battery Capacity, kWh) used to build the
 * Sensitivity Matrix. Same reasoning as above — clean steps across the 0-30kWh
 * slider range. */
export const SENSITIVITY_STATIONARY_CAPACITY_STEPS_KWH = [0, 5, 10, 15, 20, 25, 30];

/** Default cost assumptions for the payback calculation. The original feature
 * spec had no cost inputs at all — these are reasonable Australian-market
 * defaults added so the payback math has something to work with out of the box.
 * See README.md "Locked decisions" #9 for the full reasoning (especially why the
 * V2G charger is a flat cost rather than priced per kW). */
export const DEFAULT_CAPEX = {
  batteryCostPerKwh: 900,
  solarCostPerKw: 1200,
  v2gChargerFixedCost: 10000,
};

/** The app's out-of-the-box configuration — what every slider is set to before
 * the user (or a preset) changes anything. Every preset in lib/presets.ts starts
 * from this object and only overrides the specific fields it cares about. */
export const DEFAULT_SIMULATION_INPUTS: SimulationInputs = {
  battery: {
    capacityKwh: 10, // a modest, mid-range home battery size
    reserveSocPct: 20, // keep a modest reserve for backup by default
    startingSocPct: 20, // defaults to matching reserveSocPct — see README #10
  },
  ev: {
    ownsEv: true, // default to "yes, this household has an EV" — matches the
    // app's original behavior before opting out was possible
    capacityKwh: 60, // matches the feature spec's stated default
    chargerPowerKw: 7, // matches the feature spec's stated default
    dischargeFloorPct: 30, // keeps a meaningful driving buffer by default
    departureHour: 8, // 8:00 AM, matches the feature spec's example
    arrivalHour: 18, // 6:00 PM, matches the feature spec's example
    dailyCommuteKwh: 12, // matches the feature spec's stated default
    startingSocPct: 80, // "charged up overnight" starting assumption — see README #10
  },
  solar: {
    capacityKw: 6.6, // matches the reference solar_profile.json system exactly,
    // so with default settings the scaling ratio is 1 (no stretching/shrinking)
  },
  load: {
    dailyKwh: 18.2, // matches the reference household_load.json exactly, for the
    // same reason as above
    criticalLoadPct: 0.3, // matches the reference data's own critical_load_percentage
    criticalLoadPctIsOverridden: false, // use the JSON's real per-hour shape by
    // default, only switch to the flat formula once the user touches this slider
  },
  capex: { ...DEFAULT_CAPEX },
  blackoutStartHour: 18, // 6:00 PM — start of Evening Peak, see README #6
};
