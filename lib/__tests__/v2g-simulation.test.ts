// -----------------------------------------------------------------------------
// lib/__tests__/v2g-simulation.test.ts
//
// Automated checks for the simulation engine in lib/v2g-simulation.ts. Each
// `test(...)` block below describes one specific behavior in plain English,
// sets up a scenario, and then uses `expect(...)` to assert what the correct
// result should be. Run these with `npm test` — every one should print a green
// checkmark. If a change to the engine ever turns one of these red, that's the
// signal to stop and figure out whether the engine broke, or whether the test
// itself needs to be updated because a locked decision genuinely changed (see
// README.md's "Locked decisions" section for what each of these is checking).
//
// These tests use the REAL reference JSON files from /data, not made-up
// numbers, so they're checking the engine against the actual data this app
// ships with.
// -----------------------------------------------------------------------------

import { describe, expect, test } from "vitest";

import { DEFAULT_SIMULATION_INPUTS } from "@/lib/constants";
import { tariffSchedule as tariff, referenceSolarProfile as refSolar, referenceHouseholdLoad as refLoad } from "@/lib/reference-data";
import {
  scaleReferenceData,
  runHourlyDispatch,
  computeBaselineScenario,
  runFullSimulation,
  runSensitivityMatrix,
} from "@/lib/v2g-simulation";
import type { SimulationInputs } from "@/lib/types";

describe("v2g-simulation engine", () => {
  // ---------------------------------------------------------------------------
  // Test 1: with no battery, no solar, and an EV that's never home, the
  // simulated cost should be identical to a plain, manually-computed grid-only
  // electricity bill. This confirms the "baseline" used for savings comparisons
  // isn't secretly using different math than the real simulation — see
  // README.md "Locked decisions" #7.
  // ---------------------------------------------------------------------------
  test("baseline scenario (no equipment) matches a manually-computed grid-only bill", () => {
    const baseline = computeBaselineScenario(DEFAULT_SIMULATION_INPUTS, tariff, refSolar, refLoad);

    // Hand-computed expected cost: sum of (demand this hour × that hour's import
    // rate), plus the flat daily fee. No solar means no export revenue, and no
    // battery means no discharge — so this is exactly what a household with none
    // of this equipment would pay. DEFAULT_SIMULATION_INPUTS.load.dailyKwh
    // matches the reference data's own daily total, so the demand curve isn't
    // being scaled here (ratio of 1), making this hand-computation exact.
    let expectedCost = 0;
    for (let hour = 0; hour < 24; hour++) {
      expectedCost += refLoad.hourly_demand_kw[hour].demand_kw * tariff.hourly_schedule[hour].import_rate_per_kwh;
    }
    expectedCost += tariff.tariff_info.daily_supply_charge;

    expect(baseline.netDailyCost).toBeCloseTo(expectedCost, 6);
  });

  // ---------------------------------------------------------------------------
  // Test 2: during a real midday hour where solar generation is bigger than
  // household demand, the leftover ("surplus") solar power should charge the
  // stationary battery, and nothing should need to be bought from the grid that
  // hour.
  // ---------------------------------------------------------------------------
  test("midday solar surplus charges the stationary battery with zero grid import", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      // A big, empty battery so it's never full and never "in the way" — this
      // isolates the thing we're actually testing (does surplus solar charge
      // it correctly?) from unrelated capacity-limit edge cases.
      battery: { capacityKwh: 30, reserveSocPct: 0, startingSocPct: 0 },
    };
    const scaled = scaleReferenceData(inputs, refSolar, refLoad);
    const result = runHourlyDispatch(inputs, scaled, tariff);

    // Hour 9 (9am) is a real surplus hour in the reference data: solar 3.40kW
    // vs. demand 0.80kW. Confirm that's still true after scaling (it is, since
    // the default inputs use the reference system's own size, a 1:1 ratio).
    const surplusAtHour9 = scaled.generation_kw[9] - scaled.demand_kw[9];
    expect(surplusAtHour9).toBeGreaterThan(0);

    const hour8 = result.hourlyStates[8];
    const hour9 = result.hourlyStates[9];

    expect(hour9.gridImportKw).toBeCloseTo(0, 6);
    // The battery's charge level should have risen by exactly the surplus
    // amount (the battery is nowhere near full or its 10kW rate limit here, so
    // nothing else could have capped the charge).
    expect(hour9.stationarySocKwh - hour8.stationarySocKwh).toBeCloseTo(surplusAtHour9, 6);
  });

  // ---------------------------------------------------------------------------
  // Test 3: the stationary battery's Reserve SoC is a floor during NORMAL
  // (non-outage) operation — it should never be allowed to discharge below it,
  // even during the expensive Evening Peak hours when demand is highest. See
  // README.md "Locked decisions" #4.
  // ---------------------------------------------------------------------------
  test("stationary battery never discharges below its reserve floor in normal operation", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      battery: { capacityKwh: 10, reserveSocPct: 30, startingSocPct: 30 },
    };
    const reserveFloorKwh = (inputs.battery.reserveSocPct / 100) * inputs.battery.capacityKwh;

    const scaled = scaleReferenceData(inputs, refSolar, refLoad);
    const result = runHourlyDispatch(inputs, scaled, tariff);

    for (const hourState of result.hourlyStates) {
      expect(hourState.stationarySocKwh).toBeGreaterThanOrEqual(reserveFloorKwh - 1e-9);
    }

    // Make sure this test is actually exercising discharge behavior during
    // Evening Peak (not just trivially true because the battery never tried to
    // discharge at all) — otherwise the check above wouldn't prove much.
    const dischargedDuringEveningPeak = result.hourlyStates.some(
      (s) => s.period === "Evening Peak" && s.stationaryDischargeKw > 0
    );
    expect(dischargedDuringEveningPeak).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 4: if a blackout starts at a moment the EV happens to be away (out
  // being driven), the EV should contribute NOTHING to survival time — the
  // "combined" (stationary + EV) and "stationary-only" results should be
  // identical. See README.md "Locked decisions" #6.
  // ---------------------------------------------------------------------------
  test("EV contributes zero resilience when it's away at the moment the blackout starts", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      // Departs 10pm, returns 6am — so at midnight (hour 0), the EV is away.
      ev: { ...DEFAULT_SIMULATION_INPUTS.ev, departureHour: 22, arrivalHour: 6 },
      blackoutStartHour: 0,
    };

    const result = runFullSimulation(inputs, tariff, refSolar, refLoad);

    expect(result.outageCombined.survivalHours).toBeCloseTo(
      result.outageStationaryOnly.survivalHours,
      6
    );
  });

  // ---------------------------------------------------------------------------
  // Test 5: V2G discharge (the EV feeding power back into the house) is only
  // allowed to happen during Evening Peak hours, per the app's dispatch
  // priority order. Even if the EV is plugged in and well above its discharge
  // floor during an Off-Peak hour, it should NOT discharge — any unmet demand
  // should fall through to a grid import instead. See README.md "Locked
  // decisions" #3.
  // ---------------------------------------------------------------------------
  test("EV never discharges (V2G) outside Evening Peak hours", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      // No stationary battery at all, so it can't "absorb" the unmet demand
      // first — this isolates the EV/grid behavior we're actually testing.
      battery: { capacityKwh: 0, reserveSocPct: 0, startingSocPct: 0 },
    };
    const scaled = scaleReferenceData(inputs, refSolar, refLoad);
    const result = runHourlyDispatch(inputs, scaled, tariff);

    // Midnight: Off-Peak, and the EV (default 8am-6pm commute) is plugged in
    // and, with its default 80% starting charge, well above its 30% floor.
    const midnight = result.hourlyStates[0];
    expect(midnight.period).toBe("Off-Peak");
    expect(midnight.evPluggedIn).toBe(true);
    expect(midnight.evDischargeKw).toBeCloseTo(0, 6);
    // With no stationary battery and no solar at midnight, ALL unmet demand
    // should show up as a grid import instead.
    expect(midnight.gridImportKw).toBeCloseTo(midnight.demandKw - midnight.solarKw, 6);
  });

  // ---------------------------------------------------------------------------
  // Test 6: the daily commute energy deduction happens exactly once (at the
  // moment the EV departs), not repeatedly, and never pushes the EV's charge
  // below zero. See README.md "Locked decisions" #5.
  // ---------------------------------------------------------------------------
  test("commute energy is deducted exactly once, at departure, and clamped at zero", () => {
    const { dailyCommuteKwh, capacityKwh, departureHour } = DEFAULT_SIMULATION_INPUTS.ev;
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      ev: {
        ...DEFAULT_SIMULATION_INPUTS.ev,
        // Start the EV with EXACTLY enough charge for one commute, so departure
        // should bring it to precisely zero.
        startingSocPct: (dailyCommuteKwh / capacityKwh) * 100,
      },
    };
    const scaled = scaleReferenceData(inputs, refSolar, refLoad);
    const result = runHourlyDispatch(inputs, scaled, tariff);

    // Nothing should have charged the EV in the hours before it leaves (there's
    // no solar surplus available that early in the morning in this data), so
    // its charge should still be sitting at the starting amount right up until
    // departure.
    const hourBeforeDeparture = result.hourlyStates[departureHour - 1];
    expect(hourBeforeDeparture.evSocKwh).toBeCloseTo(dailyCommuteKwh, 6);

    // At the departure hour itself, the commute deduction should bring it
    // exactly to zero (not negative).
    const departureHourState = result.hourlyStates[departureHour];
    expect(departureHourState.evSocKwh).toBeCloseTo(0, 6);

    // And it should never go negative anywhere else in the day, confirming the
    // deduction isn't being (incorrectly) reapplied on a later hour.
    for (const state of result.hourlyStates) {
      expect(state.evSocKwh).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  // ---------------------------------------------------------------------------
  // Bonus regression guard: a Sensitivity Matrix cell with reserveSocPct=0 and
  // stationaryCapacityKwh=0 (i.e. "no stationary battery at all") should give
  // the exact same payback result as calling the main engine directly with no
  // stationary battery. This confirms the 63-cell matrix sweep in
  // runSensitivityMatrix() is really reusing the same engine, not a
  // second, slightly-different copy of the math.
  // ---------------------------------------------------------------------------
  test("a zero-battery sensitivity matrix cell matches calling the engine directly", () => {
    const matrix = runSensitivityMatrix(
      DEFAULT_SIMULATION_INPUTS,
      tariff,
      refSolar,
      refLoad,
      [0], // just the reserveSocPct=0 row
      [0] // just the stationaryCapacityKwh=0 column
    );
    const cell = matrix[0][0];

    const directResult = runFullSimulation(
      {
        ...DEFAULT_SIMULATION_INPUTS,
        battery: { capacityKwh: 0, reserveSocPct: 0, startingSocPct: 0 },
      },
      tariff,
      refSolar,
      refLoad
    );

    expect(cell.paybackYears).toBe(directResult.financials.paybackYears);
    expect(cell.survivalHoursCombined).toBeCloseTo(
      directResult.outageCombined.survivalHours,
      6
    );
    expect(cell.survivalHoursCombinedExhausted).toBe(directResult.outageCombined.exhausted);
  });

  // ---------------------------------------------------------------------------
  // Regression test: docs/dev-log/phase-6-sensitivity-matrix.md records, in
  // prose, a real finding from testing the Sensitivity Matrix Table by hand —
  // Reserve SoC has ZERO effect on Survival Hours, because README.md "Locked
  // decisions" #4 says the stationary battery is always allowed to drain all
  // the way to 0% during a simulated blackout, regardless of what its Reserve
  // SoC is set to. `runOutageSimulation()` (see lib/v2g-simulation.ts) never
  // even reads `inputs.battery.reserveSocPct` — the reserve floor simply isn't
  // part of the outage math at all. Turning that prose finding into a test
  // here means a future change that accidentally makes the outage simulator
  // respect the reserve floor (which would silently break decision #4) gets
  // caught automatically instead of relying on someone noticing a dev-log
  // sentence.
  //
  // To isolate the OUTAGE-time behavior specifically (not just re-prove that
  // reserveSocPct is ignored, but prove it's ignored even though the two
  // scenarios are otherwise real, independently-simulated days), both
  // scenarios pin `battery.startingSocPct` to the SAME fixed value (90%) —
  // if it were left to default to reserveSocPct (this app's normal rule, see
  // README.md #10), the two scenarios would also start the day with different
  // charge levels, which would change how much normal (non-outage) discharging
  // happens before the blackout and confound the comparison. `blackoutStartHour`
  // is also set to 0 (rather than the default 18:00) so only a single hour of
  // ordinary dispatch (hour 0, where solar is 0 and demand is a small 0.35kW —
  // see data/household_load.json) runs before the blackout state is captured,
  // and that hour's demand is small enough that neither reserve floor (10% or
  // 70% of a 10kWh battery, i.e. 1kWh or 7kWh, against a 9kWh starting charge)
  // is ever actually reached — so both scenarios enter the outage with exactly
  // the same battery charge, confirmed below.
  // ---------------------------------------------------------------------------
  test("Reserve SoC has zero effect on outage survival hours (locks in a Phase 6 finding)", () => {
    const lowReserveInputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      blackoutStartHour: 0,
      battery: { capacityKwh: 10, reserveSocPct: 10, startingSocPct: 90 },
    };
    const highReserveInputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      blackoutStartHour: 0,
      battery: { capacityKwh: 10, reserveSocPct: 70, startingSocPct: 90 },
    };

    const lowReserveResult = runFullSimulation(lowReserveInputs, tariff, refSolar, refLoad);
    const highReserveResult = runFullSimulation(highReserveInputs, tariff, refSolar, refLoad);

    // Confirm the two scenarios really do enter the outage at the same charge
    // level — otherwise a matching survival-hours result below wouldn't prove
    // anything about the reserve floor specifically.
    expect(lowReserveResult.configured.hourlyStates[0].stationarySocKwh).toBeCloseTo(
      highReserveResult.configured.hourlyStates[0].stationarySocKwh,
      6
    );

    expect(lowReserveResult.outageCombined.survivalHours).toBeCloseTo(
      highReserveResult.outageCombined.survivalHours,
      6
    );
    expect(lowReserveResult.outageStationaryOnly.survivalHours).toBeCloseTo(
      highReserveResult.outageStationaryOnly.survivalHours,
      6
    );
  });

  // ---------------------------------------------------------------------------
  // Regression test: the same Phase 6 finding as above, checked at the level
  // the Sensitivity Matrix Table actually shows it — every row (Reserve SoC
  // step) of a given column (Stationary Capacity step) should report the exact
  // same Survival Hours, since runSensitivityMatrix() re-runs the full engine
  // per cell and, per the test above, the outage simulator never uses
  // reserveSocPct at all. Using a fixed 10kWh capacity column against
  // reserveSocPct steps [0, 40, 80] here (rather than the full default 9×7
  // grid) keeps the assertion simple to read while still covering the low,
  // middle, and high ends of the Reserve SoC slider's 0-80% range.
  // ---------------------------------------------------------------------------
  test("every reserveSocPct row of a sensitivity matrix column has identical Survival Hours (locks in a Phase 6 finding)", () => {
    const matrix = runSensitivityMatrix(
      DEFAULT_SIMULATION_INPUTS,
      tariff,
      refSolar,
      refLoad,
      [0, 40, 80], // reserveSocPct rows: low, middle, high
      [10] // a single stationaryCapacityKwh column
    );

    const survivalHoursInColumn = matrix.map((row) => row[0].survivalHoursCombined);

    for (const survivalHours of survivalHoursInColumn) {
      expect(survivalHours).toBeCloseTo(survivalHoursInColumn[0], 6);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: opting out of EV ownership (ev.ownsEv: false) must stop the V2G
  // charger's fixed cost from being counted in totalCapex — it's a flat cost
  // (not driven by EV capacity), so it needs its own explicit check separate
  // from getEffectiveEVConfig()'s capacity/schedule zeroing. Confirms both the
  // exact dollar difference AND that the opted-out total matches a hand
  // computation with no EV term at all.
  // ---------------------------------------------------------------------------
  test("opting out of EV ownership excludes the V2G charger cost from totalCapex", () => {
    const ownedInputs = DEFAULT_SIMULATION_INPUTS; // ownsEv: true by default
    const optedOutInputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      ev: { ...DEFAULT_SIMULATION_INPUTS.ev, ownsEv: false },
    };

    const owned = runFullSimulation(ownedInputs, tariff, refSolar, refLoad);
    const optedOut = runFullSimulation(optedOutInputs, tariff, refSolar, refLoad);

    expect(owned.financials.totalCapex - optedOut.financials.totalCapex).toBeCloseTo(
      DEFAULT_SIMULATION_INPUTS.capex.v2gChargerFixedCost,
      6
    );

    const expectedOptedOutCapex =
      DEFAULT_SIMULATION_INPUTS.battery.capacityKwh * DEFAULT_SIMULATION_INPUTS.capex.batteryCostPerKwh +
      DEFAULT_SIMULATION_INPUTS.solar.capacityKw * DEFAULT_SIMULATION_INPUTS.capex.solarCostPerKw;
    expect(optedOut.financials.totalCapex).toBeCloseTo(expectedOptedOutCapex, 6);
  });

  // ---------------------------------------------------------------------------
  // Test 8: with ev.ownsEv set to false, the EV must be numerically inert for
  // all 24 hours — no charge, no discharge, no state of charge, AND never shown
  // as "plugged in" — even though departureHour/arrivalHour are left at their
  // normal 8am/6pm defaults. That last part specifically locks in the
  // SCHEDULE half of getEffectiveEVConfig()'s fix: zeroing capacityKwh alone
  // zeroes charge/discharge/SoC (the room/discharge formulas bottom out at 0),
  // but evPluggedIn is driven purely by the departure/arrival schedule via
  // isEvAway(), completely independent of capacity — so this test would catch
  // a regression that only zeroed capacity and forgot the schedule.
  // ---------------------------------------------------------------------------
  test("EV charge, discharge, SoC, and plugged-in status all stay off when the household doesn't own one", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      ev: { ...DEFAULT_SIMULATION_INPUTS.ev, ownsEv: false },
    };
    const scaled = scaleReferenceData(inputs, refSolar, refLoad);
    const result = runHourlyDispatch(inputs, scaled, tariff);

    for (const state of result.hourlyStates) {
      expect(state.evChargeKw).toBeCloseTo(0, 6);
      expect(state.evDischargeKw).toBeCloseTo(0, 6);
      expect(state.evSocKwh).toBeCloseTo(0, 6);
      expect(state.evSocPct).toBeCloseTo(0, 6);
      expect(state.evPluggedIn).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 9: the Sensitivity Matrix's "combined capacity" figure (stationary +
  // EV, shown as each column's sub-label) must collapse to exactly the
  // stationary capacity when the household doesn't own an EV — otherwise it
  // would silently keep adding a phantom EV capacity nobody actually has.
  // ---------------------------------------------------------------------------
  test("sensitivity matrix combinedCapacityKwh collapses to stationaryCapacityKwh when EV is opted out", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      ev: { ...DEFAULT_SIMULATION_INPUTS.ev, ownsEv: false },
    };
    const matrix = runSensitivityMatrix(inputs, tariff, refSolar, refLoad, [0], [10]);
    const cell = matrix[0][0];

    expect(cell.stationaryCapacityKwh).toBe(10);
    expect(cell.combinedCapacityKwh).toBe(cell.stationaryCapacityKwh);
  });

  // ---------------------------------------------------------------------------
  // Test 10: with the EV opted out, the "combined" and "stationary-only" outage
  // survival figures must be identical — there's no EV to contribute anything.
  // Uses the default commute schedule (8am-6pm) and default blackoutStartHour
  // (18:00, when the EV would normally be freshly home and well-charged) so
  // this genuinely proves the exclusion, rather than the EV happening to be
  // away or empty for unrelated reasons (see Test 4, which tests that
  // different scenario).
  // ---------------------------------------------------------------------------
  test("outageCombined equals outageStationaryOnly when the household doesn't own an EV", () => {
    const inputs: SimulationInputs = {
      ...DEFAULT_SIMULATION_INPUTS,
      ev: { ...DEFAULT_SIMULATION_INPUTS.ev, ownsEv: false },
    };
    const result = runFullSimulation(inputs, tariff, refSolar, refLoad);

    expect(result.outageCombined.survivalHours).toBeCloseTo(
      result.outageStationaryOnly.survivalHours,
      6
    );
    expect(result.outageCombined.exhausted).toBe(result.outageStationaryOnly.exhausted);
  });
});
