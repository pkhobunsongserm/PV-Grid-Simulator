// -----------------------------------------------------------------------------
// lib/v2g-simulation.ts
//
// THE CORE SIMULATION ENGINE. This file has no React, no UI, no browser code of
// any kind in it — it's plain TypeScript functions that take some numbers in and
// produce some numbers out. That's deliberate: it means every function here can
// be tested on its own (see lib/__tests__/v2g-simulation.test.ts) and read/
// understood without needing to know anything about how the app displays its
// results.
//
// If you're new to this codebase, read README.md's "Locked decisions" section
// FIRST — it explains *why* this file behaves the way it does. Comments in this
// file reference those decisions by number rather than re-explaining them.
// -----------------------------------------------------------------------------

import {
  STATIONARY_BATTERY_MAX_RATE_KW,
  OUTAGE_SIMULATION_CAP_HOURS,
  SENSITIVITY_RESERVE_SOC_STEPS_PCT,
  SENSITIVITY_STATIONARY_CAPACITY_STEPS_KWH,
} from "./constants";
import type {
  SimulationInputs,
  EVConfig,
  ScaledProfiles,
  SolarProfileData,
  HouseholdLoadData,
  TariffSchedule,
  HourlyState,
  SimulationResult,
  OutageResult,
  FinancialSummary,
  SensitivityMatrixCell,
} from "./types";

// One simulated time step = 1 hour, because our reference data is hourly
// (resolution_minutes: 60). Every energy total below is multiplied by this
// value rather than just added directly, purely so that "kW this hour" and
// "kWh added this hour" are related by an explicit formula instead of an
// invisible coincidence. If this app ever moves to 15-minute data, changing
// this one constant (and the loop that uses it) is the only change needed —
// see README.md "Locked decisions" #11 ("Units").
const HOURS_PER_STEP = 1;

// =============================================================================
// 1. SCALING THE REFERENCE DATA
// =============================================================================

/**
 * The three reference JSON files describe ONE specific system: a 6.6kW solar
 * array and an 18.2kWh/day household. When the user picks a different Solar
 * Capacity or Base Load on a slider, this function produces a resized COPY of
 * the hourly curves that keeps the same overall shape (the solar "bell curve"
 * through the day, the morning/evening demand peaks) but scaled up or down to
 * match the chosen size.
 *
 * See README.md "Locked decisions" #2 for the full reasoning, including why the
 * inverter clipping limit scales along with the panel size.
 */
export function scaleReferenceData(
  inputs: SimulationInputs,
  refSolar: SolarProfileData,
  refLoad: HouseholdLoadData
): ScaledProfiles {
  // These ratios compare "what the user asked for" to "what the reference data
  // represents". A ratio of 1 means no change; 2 means double the reference
  // system; 0.5 means half. Both denominators are fixed numbers from the JSON
  // files (never user-controlled), so this can never divide by zero.
  const solarRatio = inputs.solar.capacityKw / refSolar.system_info.capacity_kw;
  const loadRatio = inputs.load.dailyKwh / refLoad.household_info.daily_total_kwh;

  // Real solar inverters cap how much AC power can come out, even if the panels
  // could technically produce more (this is why the reference data's own peak,
  // 5.20kW, is clipped down to its 5.0kW inverter limit). We assume that same
  // panel-to-inverter ratio holds at any system size, rather than adding a
  // separate "inverter size" slider — a stated MVP simplification.
  const scaledInverterLimitKw = refSolar.system_info.inverter_limit_kw * solarRatio;

  const generation_kw = refSolar.hourly_generation_kw.map((entry) =>
    Math.min(entry.pv_output_kw * solarRatio, scaledInverterLimitKw)
  );

  const demand_kw = refLoad.hourly_demand_kw.map((entry) => entry.demand_kw * loadRatio);

  // Critical load (the portion of demand that must stay powered during a
  // blackout) has two modes — see README.md #2:
  //   - Default: scale the reference data's own per-hour critical values by the
  //     same loadRatio, preserving their real hour-to-hour shape.
  //   - Overridden: once the user touches the Critical Load % slider, switch to
  //     a flat formula (this hour's demand × their chosen percentage) instead.
  const critical_demand_kw = inputs.load.criticalLoadPctIsOverridden
    ? demand_kw.map((demandThisHour) => demandThisHour * inputs.load.criticalLoadPct)
    : refLoad.hourly_demand_kw.map((entry) => entry.critical_demand_kw * loadRatio);

  return { generation_kw, demand_kw, critical_demand_kw };
}

// =============================================================================
// 2. EV SCHEDULE HELPER
// =============================================================================

/**
 * Is the EV away from home (out being driven) during a given hour?
 *
 * Handles the normal case (e.g. leaves 8am, back 6pm) and the case where the
 * commute schedule crosses midnight (e.g. leaves 10pm, back 6am) using modular
 * ("wrap-around") arithmetic. If departureHour and arrivalHour are set to the
 * exact same value, we treat that as "the EV is never home" rather than
 * throwing an error — see README.md "Locked decisions" #5.
 */
export function isEvAway(hour: number, departureHour: number, arrivalHour: number): boolean {
  if (departureHour === arrivalHour) {
    return true;
  }
  if (arrivalHour > departureHour) {
    // Normal same-day case, e.g. departs 8, arrives 18 → away for hours 8-17.
    return hour >= departureHour && hour < arrivalHour;
  }
  // Overnight case, e.g. departs 22, arrives 6 → away for hours 22-23 AND 0-5.
  return hour >= departureHour || hour < arrivalHour;
}

/**
 * Returns the EV config to actually simulate with. If the household doesn't
 * own an EV (`ownsEv: false`), this zeroes out BOTH capacity and schedule —
 * not just capacity — because they neutralize two different things:
 *   - capacityKwh: 0 makes every charge/discharge amount compute to exactly 0
 *     (the room/discharge formulas in runHourlyDispatch all bottom out at 0
 *     when there's no capacity to fill or drain).
 *   - departureHour === arrivalHour makes isEvAway() return true for every
 *     hour (see its own doc comment above), which is what actually drives
 *     HourlyState.evPluggedIn to false all day — capacity alone has NO effect
 *     on evPluggedIn, since it's derived purely from the schedule.
 * Without the schedule half of this fix, a household with no EV would still
 * show "EV plugged in" during its old commute hours. This reuses the exact
 * "always away" convention computeBaselineScenario() already relies on.
 */
export function getEffectiveEVConfig(ev: EVConfig): EVConfig {
  return ev.ownsEv ? ev : { ...ev, capacityKwh: 0, departureHour: 0, arrivalHour: 0 };
}

// =============================================================================
// 3. THE MAIN 24-HOUR DISPATCH LOOP
// =============================================================================

/**
 * Runs the full 24-hour simulation for one set of inputs and one set of
 * (already-scaled) generation/demand curves, and returns what happened every
 * hour plus the resulting cost.
 *
 * Every hour, power is allocated in this exact priority order (see README.md
 * "Locked decisions" #3 for the reasoning behind this specific order):
 *   1. Solar → home load, directly.
 *   2. Solar surplus → charge the stationary battery.
 *   3. Remaining solar surplus → charge the EV (if it's home).
 *   4. Remaining solar surplus → sell to the grid ("export").
 *   5. Unmet demand → discharge the stationary battery (any time of day, as
 *      long as it's above its Reserve floor).
 *   6. Remaining unmet demand, ONLY during Evening Peak hours → discharge the
 *      EV into the house ("V2G", if it's home and above its floor).
 *   7. Whatever's still unmet → buy from the grid ("import").
 */
export function runHourlyDispatch(
  inputs: SimulationInputs,
  scaled: ScaledProfiles,
  tariff: TariffSchedule
): SimulationResult {
  // Whichever EV config is actually simulated — the household's own settings,
  // or a capacity-and-schedule-zeroed stand-in if they don't own an EV. See
  // getEffectiveEVConfig()'s doc comment for why both need zeroing, not just
  // capacity.
  const ev = getEffectiveEVConfig(inputs.ev);

  // Starting charge levels, converted from a percentage into an actual kWh
  // amount, since that's what we'll be adding/subtracting power to/from.
  let stationarySocKwh = (inputs.battery.startingSocPct / 100) * inputs.battery.capacityKwh;
  let evSocKwh = (ev.startingSocPct / 100) * ev.capacityKwh;

  // The "floor" each battery isn't allowed to discharge below, expressed in kWh
  // rather than percent so it's directly comparable to the charge levels above.
  const reserveFloorKwh = (inputs.battery.reserveSocPct / 100) * inputs.battery.capacityKwh;
  const evFloorKwh = (ev.dischargeFloorPct / 100) * ev.capacityKwh;

  const hourlyStates: HourlyState[] = [];

  for (let hour = 0; hour < 24; hour++) {
    // The daily commute energy is subtracted from the EV exactly once, right as
    // it leaves for the day, before anything else happens this hour. See
    // README.md #5 — this is a single round-trip total, not tracked separately
    // for the outbound vs. return legs. Clamped at 0 so it can never go negative.
    if (hour === ev.departureHour) {
      evSocKwh = Math.max(0, evSocKwh - ev.dailyCommuteKwh);
    }

    const pluggedIn = !isEvAway(hour, ev.departureHour, ev.arrivalHour);
    const tariffEntry = tariff.hourly_schedule[hour];

    const solarKw = scaled.generation_kw[hour];
    const demandKw = scaled.demand_kw[hour];

    // Split this hour into either "we have leftover solar" or "solar wasn't
    // enough" — only one of these two will end up non-zero.
    let remainingSolarKw = Math.max(0, solarKw - demandKw);
    let unmetDemandKw = Math.max(0, demandKw - solarKw);

    // --- Step 2: solar surplus charges the stationary battery ---
    const stationaryChargeRoomKw = Math.max(
      0,
      Math.min(STATIONARY_BATTERY_MAX_RATE_KW, inputs.battery.capacityKwh - stationarySocKwh)
    );
    const stationaryChargeKw = Math.min(remainingSolarKw, stationaryChargeRoomKw);
    stationarySocKwh += stationaryChargeKw * HOURS_PER_STEP;
    remainingSolarKw -= stationaryChargeKw;

    // --- Step 3: remaining solar surplus charges the EV, if it's home ---
    let evChargeKw = 0;
    if (pluggedIn) {
      const evChargeRoomKw = Math.max(0, Math.min(ev.chargerPowerKw, ev.capacityKwh - evSocKwh));
      evChargeKw = Math.min(remainingSolarKw, evChargeRoomKw);
      evSocKwh += evChargeKw * HOURS_PER_STEP;
      remainingSolarKw -= evChargeKw;
    }

    // --- Step 4: whatever solar is left over gets sold to the grid ---
    const gridExportKw = remainingSolarKw;

    // --- Step 5: stationary battery covers unmet demand, any hour, above reserve ---
    const stationaryDischargeRoomKw = Math.max(0, stationarySocKwh - reserveFloorKwh);
    const stationaryDischargeKw = Math.min(
      unmetDemandKw,
      STATIONARY_BATTERY_MAX_RATE_KW,
      stationaryDischargeRoomKw
    );
    stationarySocKwh -= stationaryDischargeKw * HOURS_PER_STEP;
    unmetDemandKw -= stationaryDischargeKw;

    // --- Step 6: EV V2G covers remaining unmet demand, Evening Peak only ---
    let evDischargeKw = 0;
    if (pluggedIn && tariffEntry.period === "Evening Peak") {
      const evDischargeRoomKw = Math.max(0, evSocKwh - evFloorKwh);
      evDischargeKw = Math.min(unmetDemandKw, ev.chargerPowerKw, evDischargeRoomKw);
      evSocKwh -= evDischargeKw * HOURS_PER_STEP;
      unmetDemandKw -= evDischargeKw;
    }

    // --- Step 7: anything still unmet is bought from the grid ---
    const gridImportKw = unmetDemandKw;

    hourlyStates.push({
      hour,
      period: tariffEntry.period,
      solarKw,
      demandKw,
      stationarySocKwh,
      stationarySocPct:
        inputs.battery.capacityKwh > 0 ? (stationarySocKwh / inputs.battery.capacityKwh) * 100 : 0,
      evSocKwh,
      evSocPct: ev.capacityKwh > 0 ? (evSocKwh / ev.capacityKwh) * 100 : 0,
      evPluggedIn: pluggedIn,
      stationaryChargeKw,
      stationaryDischargeKw,
      evChargeKw,
      evDischargeKw,
      gridImportKw,
      gridExportKw,
      importCost: gridImportKw * HOURS_PER_STEP * tariffEntry.import_rate_per_kwh,
      exportRevenue: gridExportKw * HOURS_PER_STEP * tariffEntry.export_rate_per_kwh,
    });
  }

  const totalImportCost = hourlyStates.reduce((sum, s) => sum + s.importCost, 0);
  const totalExportRevenue = hourlyStates.reduce((sum, s) => sum + s.exportRevenue, 0);
  const dailySupplyCharge = tariff.tariff_info.daily_supply_charge;

  return {
    hourlyStates,
    totalImportCost,
    totalExportRevenue,
    dailySupplyCharge,
    netDailyCost: totalImportCost - totalExportRevenue + dailySupplyCharge,
  };
}

// =============================================================================
// 4. BASELINE SCENARIO (for computing savings)
// =============================================================================

/**
 * To know how much money the user's equipment SAVES them, we need to know what
 * their bill would have been with NONE of it — no battery, no solar, no EV.
 *
 * Rather than writing a second, separate cost formula for that "no equipment"
 * case (which could quietly drift out of sync with the real one over time), this
 * function just calls runHourlyDispatch() again with battery/solar capacity
 * zeroed out and the EV set to "always away". See README.md #7.
 */
export function computeBaselineScenario(
  inputs: SimulationInputs,
  tariff: TariffSchedule,
  refSolar: SolarProfileData,
  refLoad: HouseholdLoadData
): SimulationResult {
  const baselineInputs: SimulationInputs = {
    ...inputs,
    battery: { ...inputs.battery, capacityKwh: 0, startingSocPct: 0, reserveSocPct: 0 },
    solar: { ...inputs.solar, capacityKw: 0 },
    // departureHour === arrivalHour makes isEvAway() return true for every hour
    // of the day — see the isEvAway() comment above.
    ev: { ...inputs.ev, departureHour: 0, arrivalHour: 0 },
  };
  const baselineScaled = scaleReferenceData(baselineInputs, refSolar, refLoad);
  return runHourlyDispatch(baselineInputs, baselineScaled, tariff);
}

// =============================================================================
// 5. FINANCIAL SUMMARY
// =============================================================================

/**
 * Turns a "with equipment" result and a "without equipment" baseline result
 * into the numbers shown on the Executive Summary cards: daily/annual savings,
 * total upfront cost, and payback period.
 */
export function computeFinancials(
  inputs: SimulationInputs,
  configured: SimulationResult,
  baseline: SimulationResult
): FinancialSummary {
  const dailySavings = baseline.netDailyCost - configured.netDailyCost;

  // Extrapolating one representative day out to a full year is a real
  // simplification (it assumes every day looks like this one) — see README.md
  // #9. Surface a disclaimer near wherever this number is displayed.
  const annualSavings = dailySavings * 365;

  const totalCapex =
    inputs.battery.capacityKwh * inputs.capex.batteryCostPerKwh +
    inputs.solar.capacityKw * inputs.capex.solarCostPerKw +
    // A household with no EV isn't buying a V2G charger — this is a flat
    // cost, not driven by EV capacity, so getEffectiveEVConfig()'s zeroing
    // trick doesn't reach it; it needs its own explicit ownsEv check.
    (inputs.ev.ownsEv ? inputs.capex.v2gChargerFixedCost : 0);

  // If the configuration doesn't actually save any money (or costs more), a
  // "payback period" is meaningless — report null ("N/A") instead of a negative
  // or infinite number.
  const paybackYears = annualSavings > 0 ? totalCapex / annualSavings : null;

  return {
    baselineDailyCost: baseline.netDailyCost,
    configuredDailyCost: configured.netDailyCost,
    dailySavings,
    annualSavings,
    totalCapex,
    paybackYears,
  };
}

// =============================================================================
// 6. OUTAGE / RESILIENCE SIMULATOR
// =============================================================================

/**
 * Simulates a grid blackout starting at a given hour, and works out how many
 * hours of CRITICAL load (not the whole house — just the essentials) the
 * batteries could keep powered before running out.
 *
 * Key rules (see README.md "Locked decisions" #4 and #6 for the full reasoning):
 *   - No grid, no solar recharging during the outage — a deliberately
 *     conservative (worst-case) assumption.
 *   - The stationary battery can drain all the way to 0% during an outage — its
 *     Reserve SoC is exactly the energy an outage is supposed to draw on.
 *   - The EV only helps if it happened to be plugged in at the moment the
 *     blackout started (its plugged/away status is frozen for the whole
 *     outage), and it still won't discharge below its own floor, even in a
 *     blackout — that floor protects the ability to actually drive away.
 *   - Capped at OUTAGE_SIMULATION_CAP_HOURS so a very well-provisioned system
 *     doesn't cause the loop to run indefinitely.
 */
export function runOutageSimulation(
  inputs: SimulationInputs,
  scaled: ScaledProfiles,
  blackoutStartHour: number,
  includeEV: boolean,
  stationarySocAtBlackoutKwh: number,
  evSocAtBlackoutKwh: number,
  evPluggedInAtBlackout: boolean
): OutageResult {
  let stationaryEnergyKwh = Math.max(0, stationarySocAtBlackoutKwh);

  // Defensive normalization — see getEffectiveEVConfig()'s doc comment. The
  // caller should already be passing an evSocAtBlackoutKwh/evPluggedInAtBlackout
  // that came from a normalized dispatch run, but computing the floor from the
  // normalized config too keeps this function correct on its own.
  const ev = getEffectiveEVConfig(inputs.ev);
  const evFloorKwh = (ev.dischargeFloorPct / 100) * ev.capacityKwh;
  let evEnergyKwh =
    includeEV && evPluggedInAtBlackout ? Math.max(0, evSocAtBlackoutKwh - evFloorKwh) : 0;

  let hoursSurvived = 0;

  for (let step = 0; step < OUTAGE_SIMULATION_CAP_HOURS; step++) {
    // Wrap around the 24-hour clock as the outage runs past midnight.
    const hour = (blackoutStartHour + step) % 24;

    const netDeficitKw = Math.max(0, scaled.critical_demand_kw[hour] - scaled.generation_kw[hour]);

    if (netDeficitKw <= 0) {
      // Solar alone covers critical load this hour (can happen around midday) —
      // nothing is drained from either battery, and the hour still counts as
      // "survived".
      hoursSurvived += 1;
      continue;
    }

    const availableEnergyKwh = stationaryEnergyKwh + evEnergyKwh;

    if (netDeficitKw <= availableEnergyKwh) {
      // Enough energy exists to get through this whole hour. Drain the
      // stationary battery first, then the EV covers whatever's left.
      const fromStationaryKwh = Math.min(netDeficitKw, stationaryEnergyKwh);
      stationaryEnergyKwh -= fromStationaryKwh;
      evEnergyKwh -= netDeficitKw - fromStationaryKwh;
      hoursSurvived += 1;
    } else {
      // Not enough energy left to finish this hour — work out what FRACTION of
      // the hour was survived before running dry, then stop.
      hoursSurvived += availableEnergyKwh / netDeficitKw;
      return { survivalHours: hoursSurvived, exhausted: true, includeEV };
    }
  }

  // Made it through the entire simulation cap without running out.
  return { survivalHours: hoursSurvived, exhausted: false, includeEV };
}

// =============================================================================
// 7. FULL SIMULATION (convenience wrapper)
// =============================================================================

/** Bundles up everything a results screen would typically need: the configured
 * scenario, the baseline comparison, the financial summary, and both outage
 * survival numbers (with and without EV help) for the Executive Summary cards. */
export interface FullSimulationOutput {
  configured: SimulationResult;
  baseline: SimulationResult;
  financials: FinancialSummary;
  outageCombined: OutageResult; // counts stationary battery + EV
  outageStationaryOnly: OutageResult; // counts stationary battery alone
}

/**
 * Runs every calculation this app needs for one set of inputs, in the right
 * order, and returns them all together. This is the function the UI layer
 * (in a later phase) will actually call — it exists so components don't each
 * need to know the correct sequence of scale → dispatch → baseline → financials
 * → outage themselves.
 */
export function runFullSimulation(
  inputs: SimulationInputs,
  tariff: TariffSchedule,
  refSolar: SolarProfileData,
  refLoad: HouseholdLoadData
): FullSimulationOutput {
  const scaled = scaleReferenceData(inputs, refSolar, refLoad);
  const configured = runHourlyDispatch(inputs, scaled, tariff);
  const baseline = computeBaselineScenario(inputs, tariff, refSolar, refLoad);
  const financials = computeFinancials(inputs, configured, baseline);

  // The outage simulator needs to know how charged each battery was, and
  // whether the EV was home, at the exact moment the blackout begins — that's
  // just whatever the normal 24h simulation says was true at that hour.
  const blackoutHourState = configured.hourlyStates[inputs.blackoutStartHour];

  const outageCombined = runOutageSimulation(
    inputs,
    scaled,
    inputs.blackoutStartHour,
    true,
    blackoutHourState.stationarySocKwh,
    blackoutHourState.evSocKwh,
    blackoutHourState.evPluggedIn
  );
  const outageStationaryOnly = runOutageSimulation(
    inputs,
    scaled,
    inputs.blackoutStartHour,
    false,
    blackoutHourState.stationarySocKwh,
    blackoutHourState.evSocKwh,
    blackoutHourState.evPluggedIn
  );

  return { configured, baseline, financials, outageCombined, outageStationaryOnly };
}

// =============================================================================
// 8. SENSITIVITY MATRIX
// =============================================================================

/**
 * Builds the Reserve SoC % × Stationary Battery Capacity grid shown in the
 * Sensitivity Matrix Table. Each cell re-runs the ENTIRE simulation pipeline
 * above (scale → dispatch → baseline → financials → outage) with that cell's
 * Reserve SoC and Stationary Capacity substituted in — everything else (solar
 * size, EV settings, tariff, etc.) stays exactly as configured by the user.
 *
 * EV capacity is deliberately NOT varied by this matrix — see README.md
 * "Locked decisions" #8 (the EV is treated as a car someone already owns, not a
 * sizing decision like a battery purchase). "combinedCapacityKwh" in the result
 * is just the stationary capacity plus that fixed EV capacity, shown for
 * context on the table's column headers.
 *
 * Performance note: with the default 9×7 = 63 cells, this re-runs the full
 * simulation 63 times, but each run is only simple arithmetic over 24 numbers —
 * fast enough (well under a video frame) to recompute live on every slider
 * change with no loading indicator needed.
 */
export function runSensitivityMatrix(
  inputs: SimulationInputs,
  tariff: TariffSchedule,
  refSolar: SolarProfileData,
  refLoad: HouseholdLoadData,
  reserveSocStepsPct: number[] = SENSITIVITY_RESERVE_SOC_STEPS_PCT,
  stationaryCapacityStepsKwh: number[] = SENSITIVITY_STATIONARY_CAPACITY_STEPS_KWH
): SensitivityMatrixCell[][] {
  return reserveSocStepsPct.map((reserveSocPct) =>
    stationaryCapacityStepsKwh.map((stationaryCapacityKwh) => {
      const cellInputs: SimulationInputs = {
        ...inputs,
        battery: {
          ...inputs.battery,
          reserveSocPct,
          capacityKwh: stationaryCapacityKwh,
          // Each cell's battery starts the simulated day sitting at its own
          // reserve line, matching the app-wide default rule (README.md #10).
          startingSocPct: reserveSocPct,
        },
      };

      const scaled = scaleReferenceData(cellInputs, refSolar, refLoad);
      const configured = runHourlyDispatch(cellInputs, scaled, tariff);
      const baseline = computeBaselineScenario(cellInputs, tariff, refSolar, refLoad);
      const financials = computeFinancials(cellInputs, configured, baseline);

      const blackoutHourState = configured.hourlyStates[cellInputs.blackoutStartHour];
      const combinedOutage = runOutageSimulation(
        cellInputs,
        scaled,
        cellInputs.blackoutStartHour,
        true,
        blackoutHourState.stationarySocKwh,
        blackoutHourState.evSocKwh,
        blackoutHourState.evPluggedIn
      );

      return {
        reserveSocPct,
        stationaryCapacityKwh,
        combinedCapacityKwh:
          stationaryCapacityKwh + getEffectiveEVConfig(cellInputs.ev).capacityKwh,
        paybackYears: financials.paybackYears,
        survivalHoursCombined: combinedOutage.survivalHours,
        survivalHoursCombinedExhausted: combinedOutage.exhausted,
      };
    })
  );
}
