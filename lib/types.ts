// -----------------------------------------------------------------------------
// lib/types.ts
//
// This file defines the "shape" of every piece of data used in this app, using
// TypeScript "interfaces" (a description of what fields an object must have, and
// what type each field is — e.g. "a number" or "a piece of text").
//
// Nothing in this file actually *does* anything — there's no logic here, just
// definitions. Think of it as a glossary/blueprint that every other file in the
// project agrees to follow. The big benefit: if some other file tries to use one
// of these objects incorrectly (e.g. forgets a required field, or puts text where
// a number should go), your code editor will flag it immediately, before you even
// run the app.
//
// See README.md for the full explanation of *why* the simulation behaves the way
// it does — this file only defines *what shape* the data takes.
// -----------------------------------------------------------------------------

// ===== Reference data shapes =====
// These mirror the three JSON files in /data exactly, field for field, so that
// importing e.g. data/tou_tariff.json "just works" as a TypeScript object of this
// shape with no extra conversion step.

/** One hour's entry in the tariff schedule (there are 24 of these, hour 0-23). */
export interface TariffHourEntry {
  hour: number;
  // The three named pricing periods used by this tariff. "Solar Sponge" is the
  // cheap midday window meant to encourage charging batteries from the grid (we
  // don't do that in this MVP — see README "Locked decisions" #3 — but the period
  // name is still used to identify midday hours).
  period: "Off-Peak" | "Solar Sponge" | "Evening Peak";
  import_rate_per_kwh: number; // price in AUD to BUY 1kWh from the grid this hour
  export_rate_per_kwh: number; // price in AUD received for SELLING 1kWh to the grid
}

/** The full contents of data/tou_tariff.json. */
export interface TariffSchedule {
  tariff_info: {
    currency: "AUD";
    daily_supply_charge: number; // flat daily fee, charged regardless of usage
    time_zone: string;
  };
  hourly_schedule: TariffHourEntry[]; // always length 24, index = hour of day
}

/** One hour's entry in the household demand curve. */
export interface HouseholdDemandHourEntry {
  hour: number;
  demand_kw: number; // total household power draw this hour
  critical_demand_kw: number; // the portion of demand_kw that must be kept powered
  // during a blackout (fridge, essential circuits — NOT the whole house)
}

/** The full contents of data/household_load.json. */
export interface HouseholdLoadData {
  household_info: {
    daily_total_kwh: number; // reference total for one full day (18.2 in our data)
    baseload_kw: number;
    critical_load_percentage: number; // 0.30 = 30%
  };
  hourly_demand_kw: HouseholdDemandHourEntry[]; // always length 24
}

/** One hour's entry in the solar generation curve. */
export interface SolarGenerationHourEntry {
  hour: number;
  pv_output_kw: number; // how much power the reference solar system produced
}

/** The full contents of data/solar_profile.json. */
export interface SolarProfileData {
  system_info: {
    capacity_kw: number; // the reference system's panel capacity (6.6 in our data)
    inverter_limit_kw: number; // the reference system's inverter output cap (5.0)
    location: string;
    resolution_minutes: number; // 60 = hourly data (see README "Units")
  };
  hourly_generation_kw: SolarGenerationHourEntry[]; // always length 24
}

// ===== Scaled working data =====
// The reference curves above are fixed to one specific system size (6.6kW solar,
// 18.2kWh/day household). When the user picks a different size on a slider, we
// don't edit the reference files — we compute a *scaled* copy of the three curves
// that matches the user's chosen size while keeping the same overall shape
// (the solar "bell curve", the morning/evening demand peaks, etc).
// See README.md "Locked decisions" #2 for the exact scaling formula.
export interface ScaledProfiles {
  generation_kw: number[]; // length 24, one value per hour, already inverter-clipped
  demand_kw: number[]; // length 24
  critical_demand_kw: number[]; // length 24
}

// ===== User-configurable inputs (what the sidebar sliders control) =====

/** Settings for the stationary (fixed, in-the-garage) home battery. */
export interface BatteryConfig {
  capacityKwh: number; // 0-30, how much energy the battery can hold
  reserveSocPct: number; // 0-80, "State of Charge" floor — see README asymmetry note
  startingSocPct: number; // how full the battery is at the very start of the
  // simulated day (midnight). Not part of the original feature list — added
  // because the simulation can't run without knowing where it starts.
}

/** Settings for the EV and its V2G (Vehicle-to-Grid) bidirectional charger. */
export interface EVConfig {
  capacityKwh: number; // 40-100, default 60 — total EV battery size
  chargerPowerKw: number; // 3.3-11, default 7 — max rate the charger can push power
  // in either direction (charging the EV, or the EV feeding the house)
  dischargeFloorPct: number; // 20-50 — the EV never discharges below this, even
  // during a blackout (protects enough charge to actually drive away)
  departureHour: number; // 0-23, hour the EV leaves for its daily commute
  arrivalHour: number; // 0-23, hour the EV returns and is available again
  dailyCommuteKwh: number; // 5-30, default 12 — total round-trip energy used per day
  startingSocPct: number; // how full the EV is at the start of the simulated day.
  // Also not in the original feature list — added for the same reason as above.
}

/** Settings for the solar PV system. */
export interface SolarConfig {
  capacityKw: number; // 0-20
}

/** Settings for household electricity demand. */
export interface LoadConfig {
  dailyKwh: number; // total household usage for one day — scales the demand curve
  criticalLoadPct: number; // fraction (0-1) treated as "must stay powered" in a
  // blackout, IF criticalLoadPctIsOverridden is true (see below)
  criticalLoadPctIsOverridden: boolean; // false = use the reference data's own
  // per-hour critical-load shape (scaled); true = use a flat criticalLoadPct
  // applied to every hour instead. See README.md #2 for why both modes exist.
}

/** Assumptions used for the financial payback calculation. Not part of the
 * original feature list — the spec had no cost inputs, so these were added with
 * sensible defaults. See README.md "Locked decisions" #9 for the reasoning. */
export interface CapexConfig {
  batteryCostPerKwh: number; // AUD per kWh of stationary battery capacity
  solarCostPerKw: number; // AUD per kW of solar capacity
  v2gChargerFixedCost: number; // AUD, a FLAT cost (not per-kW) for the V2G charger
}

/** Every user-adjustable input to the simulation, bundled together. This is what
 * lives in the Zustand store (see store/useSimulationStore.ts in a later phase) —
 * the sliders are the single source of truth, and everything else is calculated
 * fresh from this object. */
export interface SimulationInputs {
  battery: BatteryConfig;
  ev: EVConfig;
  solar: SolarConfig;
  load: LoadConfig;
  capex: CapexConfig;
  blackoutStartHour: number; // 0-23, shared by the Executive Card's resilience
  // metric AND the Sensitivity Matrix, so both always agree on "when" a simulated
  // blackout starts. Default 18 (6pm, start of Evening Peak).
}

// ===== Simulation output =====

/** A snapshot of everything that happened during one specific hour of the
 * simulated day. The engine produces 24 of these (one per hour) per run. */
export interface HourlyState {
  hour: number;
  period: TariffHourEntry["period"];
  solarKw: number; // solar generated this hour (after scaling + inverter clipping)
  demandKw: number; // total household demand this hour (after scaling)
  stationarySocKwh: number; // stationary battery's charge level at END of this hour
  stationarySocPct: number; // same, as a percentage of its capacity
  evSocKwh: number; // EV battery's charge level at END of this hour
  evSocPct: number; // same, as a percentage of its capacity
  evPluggedIn: boolean; // was the EV physically home this hour?
  stationaryChargeKw: number; // power flowing INTO the stationary battery this hour
  stationaryDischargeKw: number; // power flowing OUT OF it this hour
  evChargeKw: number; // power flowing INTO the EV this hour
  evDischargeKw: number; // power flowing OUT OF the EV (V2G) this hour
  gridImportKw: number; // power bought from the grid this hour
  gridExportKw: number; // power sold to the grid this hour
  importCost: number; // AUD spent buying grid power this hour
  exportRevenue: number; // AUD earned selling power to the grid this hour
}

/** The full result of simulating one 24-hour day under one set of inputs. */
export interface SimulationResult {
  hourlyStates: HourlyState[]; // always length 24
  totalImportCost: number; // AUD, summed across all 24 hours
  totalExportRevenue: number; // AUD, summed across all 24 hours
  dailySupplyCharge: number; // AUD, the flat daily fee (same regardless of usage)
  netDailyCost: number; // totalImportCost - totalExportRevenue + dailySupplyCharge
}

/** The result of simulating a blackout starting at a given hour. */
export interface OutageResult {
  survivalHours: number; // how many hours of CRITICAL load could be covered.
  // Can be fractional (e.g. 14.5 means the batteries ran out partway through the
  // 15th hour). See README.md "Locked decisions" #6.
  exhausted: boolean; // true = the batteries actually ran out before the 168-hour
  // simulation cap; false = they lasted the full cap (displayed as "168+")
  includeEV: boolean; // whether this particular run counted the EV's contribution
}

/** The financial summary derived from comparing a configured scenario against a
 * no-equipment baseline. */
export interface FinancialSummary {
  baselineDailyCost: number; // AUD/day with no battery, no solar, no EV
  configuredDailyCost: number; // AUD/day with the user's actual configuration
  dailySavings: number; // baselineDailyCost - configuredDailyCost
  annualSavings: number; // dailySavings * 365 (see README.md "Locked decisions" #9
  // for why this is a simplification, not a precise forecast)
  totalCapex: number; // AUD, total upfront cost of the equipment being evaluated
  paybackYears: number | null; // totalCapex / annualSavings, or null ("N/A") if
  // annualSavings is zero or negative — you can't "pay back" a system that never
  // saves you money
}

/** One cell of the Reserve SoC × Stationary Battery Capacity sensitivity grid. */
export interface SensitivityMatrixCell {
  reserveSocPct: number; // this cell's row value
  stationaryCapacityKwh: number; // this cell's column value
  combinedCapacityKwh: number; // stationaryCapacityKwh + the EV's (fixed) capacity,
  // shown for context only — the EV capacity itself is never varied by the matrix,
  // see README.md "Locked decisions" #8
  paybackYears: number | null;
  survivalHoursCombined: number; // survival hours counting both batteries together
  survivalHoursCombinedExhausted: boolean; // mirrors OutageResult.exhausted — false
  // means the batteries lasted the full simulated cap without running out, so the UI
  // should display this as "168+h" rather than a specific number (see formatSurvivalHours
  // in lib/format.ts). Without this flag, a matrix cell showing "168" looks like an exact
  // measurement rather than "hit the simulation's safety cap."
}

/** A named, ready-to-apply bundle of input values (see lib/presets.ts). Using
 * `Partial<...>` for each section means a preset only needs to specify the values
 * it actually wants to change — anything it omits falls back to the app's normal
 * defaults. */
export interface PresetConfig {
  id: "commuter-ev" | "off-grid-heavy" | "solar-max";
  label: string;
  description: string;
  inputs: {
    battery?: Partial<BatteryConfig>;
    ev?: Partial<EVConfig>;
    solar?: Partial<SolarConfig>;
    load?: Partial<LoadConfig>;
    capex?: Partial<CapexConfig>;
    blackoutStartHour?: number;
  };
}
