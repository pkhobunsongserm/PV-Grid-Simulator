// -----------------------------------------------------------------------------
// lib/__tests__/tariff-api-to-schedule.test.ts
//
// Checks the mapping from a real AER plan response to the simulator's hourly
// TariffSchedule (lib/tariff-api/to-schedule.ts). The fixtures below are small
// copies of the real response SHAPES (field names/nesting taken from live
// responses), with prices chosen so the expected numbers are easy to verify by
// hand. Remember the AER publishes prices EXCLUDING GST, so import rates and
// the supply charge are expected to come out 1.1× the fixture values, while
// feed-in tariffs are unchanged.
// -----------------------------------------------------------------------------

import { describe, expect, test } from "vitest";

import { planToTariffSchedule, UnsupportedPlanError } from "@/lib/tariff-api/to-schedule";
import type { CdrTariffPeriod, CdrTimeOfUseRate, PlanDetail } from "@/lib/tariff-api/types";

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

function plan(
  tariffPeriod: CdrTariffPeriod[],
  extra: Partial<NonNullable<PlanDetail["electricityContract"]>> = {}
): PlanDetail {
  return {
    planId: "TEST@PLAN",
    displayName: "Test Plan",
    brandName: "Test Retailer",
    electricityContract: {
      tariffPeriod,
      solarFeedInTariff: [
        {
          scheme: "CURRENT",
          tariffUType: "singleTariff",
          singleTariff: { rates: [{ unitPrice: "0.05" }] },
        },
      ],
      ...extra,
    },
  };
}

const singleRatePeriod = (unitPrice: string, supply = "1.00"): CdrTariffPeriod => ({
  startDate: "01-01",
  endDate: "12-31",
  rateBlockUType: "singleRate",
  dailySupplyCharge: supply,
  singleRate: { rates: [{ unitPrice }] },
});

const touPeriod = (rates: CdrTimeOfUseRate[], supply = "1.00"): CdrTariffPeriod => ({
  startDate: "01-01",
  endDate: "12-31",
  rateBlockUType: "timeOfUseRates",
  dailySupplyCharge: supply,
  timeOfUseRates: rates,
});

describe("planToTariffSchedule", () => {
  test("single-rate plan: flat 24 hours, GST added to import and supply, feed-in as published", () => {
    const schedule = planToTariffSchedule(plan([singleRatePeriod("0.20", "1.00")]));

    expect(schedule.hourly_schedule).toHaveLength(24);
    for (const entry of schedule.hourly_schedule) {
      expect(entry.import_rate_per_kwh).toBeCloseTo(0.22, 5); // 0.20 × 1.1
      expect(entry.export_rate_per_kwh).toBeCloseTo(0.05, 5); // no GST on feed-in
      expect(entry.isPeak).toBe(false);
      expect(entry.period).toBe("Flat rate");
    }
    expect(schedule.tariff_info.daily_supply_charge).toBeCloseTo(1.1, 5);
    expect(schedule.tariff_info.name).toBe("Test Plan");
    expect(schedule.tariff_info.retailer).toBe("Test Retailer");
    // A flat plan has no peak — the notes should say why V2G won't discharge for savings.
    expect(schedule.tariff_info.notes?.some((n) => n.includes("no peak"))).toBe(true);
  });

  test("time-of-use plan with a window that wraps past midnight (21:00 → 00:00)", () => {
    // Shape copied from a real AGL plan: an expensive 15:00-21:00 window, and a
    // cheap rate split across 21:00-00:00 and 00:00-15:00.
    const schedule = planToTariffSchedule(
      plan([
        touPeriod([
          {
            displayName: "Tariff 1",
            type: "SHOULDER",
            rates: [{ unitPrice: "0.40" }],
            timeOfUse: [{ days: [...ALL_DAYS], startTime: "15:00", endTime: "21:00" }],
          },
          {
            displayName: "Tariff 2",
            type: "SHOULDER",
            rates: [{ unitPrice: "0.20" }],
            timeOfUse: [
              { days: [...ALL_DAYS], startTime: "21:00", endTime: "00:00" },
              { days: [...ALL_DAYS], startTime: "00:00", endTime: "15:00" },
            ],
          },
        ]),
      ])
    );

    const byHour = schedule.hourly_schedule;
    for (const hour of [15, 16, 17, 18, 19, 20]) {
      expect(byHour[hour].import_rate_per_kwh).toBeCloseTo(0.44, 5);
      expect(byHour[hour].isPeak).toBe(true);
      expect(byHour[hour].period).toBe("Peak");
    }
    for (const hour of [0, 6, 14, 21, 22, 23]) {
      expect(byHour[hour].import_rate_per_kwh).toBeCloseTo(0.22, 5);
      expect(byHour[hour].isPeak).toBe(false);
    }
  });

  test("windows starting mid-hour give a time-weighted average for that hour", () => {
    // Peak 16:30-20:30 at 0.40, everything else 0.20 (ex GST).
    const schedule = planToTariffSchedule(
      plan([
        touPeriod([
          {
            displayName: "Peak",
            type: "PEAK",
            rates: [{ unitPrice: "0.40" }],
            timeOfUse: [{ days: [...ALL_DAYS], startTime: "16:30", endTime: "20:30" }],
          },
          { displayName: "Off-peak", type: "OFF_PEAK", rates: [{ unitPrice: "0.20" }], timeOfUse: [] },
        ]),
      ])
    );

    const byHour = schedule.hourly_schedule;
    expect(byHour[16].import_rate_per_kwh).toBeCloseTo(0.33, 5); // half at 0.20, half at 0.40, × 1.1
    expect(byHour[17].import_rate_per_kwh).toBeCloseTo(0.44, 5);
    expect(byHour[20].import_rate_per_kwh).toBeCloseTo(0.33, 5);
    expect(byHour[21].import_rate_per_kwh).toBeCloseTo(0.22, 5);
    // The blended half-peak hours sit below the peak band, so they aren't flagged.
    expect(byHour[16].isPeak).toBe(false);
    expect(byHour[17].isPeak).toBe(true);
    expect(byHour[19].isPeak).toBe(true);
  });

  test("uses weekday rates and warns when weekend rates differ", () => {
    const schedule = planToTariffSchedule(
      plan([
        touPeriod([
          {
            displayName: "Peak",
            type: "PEAK",
            rates: [{ unitPrice: "0.50" }],
            timeOfUse: [{ days: [...WEEKDAYS], startTime: "17:00", endTime: "21:00" }],
          },
          {
            displayName: "Off-peak",
            type: "OFF_PEAK",
            rates: [{ unitPrice: "0.20" }],
            // Weekdays outside the peak window, plus every hour of the weekend.
            timeOfUse: [
              { days: [...WEEKDAYS], startTime: "21:00", endTime: "17:00" },
              { days: ["SAT", "SUN"], startTime: "00:00", endTime: "00:00" },
            ],
          },
        ]),
      ])
    );

    expect(schedule.hourly_schedule[18].import_rate_per_kwh).toBeCloseTo(0.55, 5);
    expect(schedule.hourly_schedule[18].isPeak).toBe(true);
    expect(schedule.tariff_info.notes?.some((n) => n.includes("Weekend rates differ"))).toBe(true);
  });

  test("stepped rates: imports use the highest step, feed-in uses the first step", () => {
    const period = singleRatePeriod("0.30");
    period.singleRate = { rates: [{ unitPrice: "0.30", volume: 10 }, { unitPrice: "0.20" }] };
    const detail = plan([period]);
    detail.electricityContract!.solarFeedInTariff = [
      {
        scheme: "CURRENT",
        tariffUType: "singleTariff",
        singleTariff: { rates: [{ unitPrice: "0.08", volume: 8 }, { unitPrice: "0.03" }] },
      },
    ];

    const schedule = planToTariffSchedule(detail);
    expect(schedule.hourly_schedule[0].import_rate_per_kwh).toBeCloseTo(0.22, 5);
    expect(schedule.hourly_schedule[0].export_rate_per_kwh).toBeCloseTo(0.08, 5);
    expect(schedule.tariff_info.notes?.filter((n) => n.includes("Stepped")).length).toBeGreaterThan(0);
  });

  test("picks the season covering today, including one that wraps the new year", () => {
    const summer: CdrTariffPeriod = { ...singleRatePeriod("0.10"), startDate: "11-01", endDate: "03-31" };
    const winter: CdrTariffPeriod = { ...singleRatePeriod("0.30"), startDate: "04-01", endDate: "10-31" };
    const detail = plan([winter, summer]);

    const january = planToTariffSchedule(detail, new Date(2026, 0, 15));
    const july = planToTariffSchedule(detail, new Date(2026, 6, 15));
    expect(january.hourly_schedule[0].import_rate_per_kwh).toBeCloseTo(0.11, 5);
    expect(july.hourly_schedule[0].import_rate_per_kwh).toBeCloseTo(0.33, 5);
    expect(january.tariff_info.notes?.some((n) => n.includes("seasons"))).toBe(true);
  });

  test("flags demand charges and controlled load instead of silently ignoring them", () => {
    const period = singleRatePeriod("0.20");
    period.demandCharges = [{ amount: "0.5" }];
    const schedule = planToTariffSchedule(plan([period], { controlledLoad: [{}] }));

    const notes = schedule.tariff_info.notes ?? [];
    expect(notes.some((n) => n.includes("Demand charges"))).toBe(true);
    expect(notes.some((n) => n.includes("Controlled-load"))).toBe(true);
  });

  test("time-varying feed-in tariff is mapped by hour, with no GST", () => {
    const detail = plan([singleRatePeriod("0.20")]);
    detail.electricityContract!.solarFeedInTariff = [
      {
        scheme: "CURRENT",
        tariffUType: "timeVaryingTariffs",
        timeVaryingTariffs: [
          {
            displayName: "Evening boost",
            rates: [{ unitPrice: "0.10" }],
            timeVariations: [{ days: [...ALL_DAYS], startTime: "17:00", endTime: "20:00" }],
          },
          {
            displayName: "Other",
            rates: [{ unitPrice: "0.02" }],
            timeVariations: [
              { days: [...ALL_DAYS], startTime: "20:00", endTime: "17:00" },
            ],
          },
        ],
      },
    ];

    const schedule = planToTariffSchedule(detail);
    expect(schedule.hourly_schedule[18].export_rate_per_kwh).toBeCloseTo(0.1, 5);
    expect(schedule.hourly_schedule[12].export_rate_per_kwh).toBeCloseTo(0.02, 5);
  });

  test("skips closed government / premium feed-in schemes in favour of the retailer's current rate", () => {
    // Shape copied from a real Alinta plan: three government "Customer Group"
    // schemes at 44c listed BEFORE the retailer's own 0.5c feed-in.
    const detail = plan([singleRatePeriod("0.20")]);
    detail.electricityContract!.solarFeedInTariff = [
      {
        scheme: "OTHER",
        payerType: "GOVERNMENT",
        tariffUType: "singleTariff",
        singleTariff: { rates: [{ unitPrice: "0.44" }] },
      },
      {
        scheme: "PREMIUM",
        payerType: "RETAILER",
        tariffUType: "singleTariff",
        singleTariff: { rates: [{ unitPrice: "0.60" }] },
      },
      {
        scheme: "OTHER",
        payerType: "RETAILER",
        tariffUType: "singleTariff",
        singleTariff: { rates: [{ unitPrice: "0.005" }] },
      },
    ];
    const schedule = planToTariffSchedule(detail);
    expect(schedule.hourly_schedule[12].export_rate_per_kwh).toBeCloseTo(0.005, 5);
  });

  test("only closed schemes listed → exports earn nothing, with a note", () => {
    const detail = plan([singleRatePeriod("0.20")]);
    detail.electricityContract!.solarFeedInTariff = [
      {
        scheme: "OTHER",
        payerType: "GOVERNMENT",
        tariffUType: "singleTariff",
        singleTariff: { rates: [{ unitPrice: "0.44" }] },
      },
    ];
    const schedule = planToTariffSchedule(detail);
    expect(schedule.hourly_schedule.every((h) => h.export_rate_per_kwh === 0)).toBe(true);
    expect(schedule.tariff_info.notes?.some((n) => n.includes("feed-in"))).toBe(true);
  });

  test("no feed-in tariff → exports earn nothing, with a note", () => {
    const detail = plan([singleRatePeriod("0.20")]);
    detail.electricityContract!.solarFeedInTariff = [];
    const schedule = planToTariffSchedule(detail);
    expect(schedule.hourly_schedule.every((h) => h.export_rate_per_kwh === 0)).toBe(true);
    expect(schedule.tariff_info.notes?.some((n) => n.includes("feed-in"))).toBe(true);
  });

  test("hours the windows leave uncovered fall back to the cheapest rate, with a note", () => {
    const schedule = planToTariffSchedule(
      plan([
        touPeriod([
          {
            displayName: "Peak",
            type: "PEAK",
            rates: [{ unitPrice: "0.50" }],
            timeOfUse: [{ days: [...ALL_DAYS], startTime: "17:00", endTime: "21:00" }],
          },
          {
            displayName: "Cheap",
            type: "OFF_PEAK",
            rates: [{ unitPrice: "0.10" }],
            timeOfUse: [{ days: [...ALL_DAYS], startTime: "00:00", endTime: "06:00" }],
          },
        ]),
      ])
    );

    expect(schedule.hourly_schedule[12].import_rate_per_kwh).toBeCloseTo(0.11, 5);
    expect(schedule.tariff_info.notes?.some((n) => n.includes("weren't covered"))).toBe(true);
  });

  test("a plan with no usable energy prices throws instead of guessing", () => {
    const empty: CdrTariffPeriod = {
      startDate: "01-01",
      endDate: "12-31",
      rateBlockUType: "demandCharges",
      dailySupplyCharge: "1.00",
      demandCharges: [{ amount: "1" }],
    };
    expect(() => planToTariffSchedule(plan([empty]))).toThrow(UnsupportedPlanError);
    expect(() => planToTariffSchedule(plan([]))).toThrow(UnsupportedPlanError);
  });

  test("missing daily supply charge is $0 with a note (rather than NaN)", () => {
    const period = singleRatePeriod("0.20");
    delete period.dailySupplyCharge;
    const schedule = planToTariffSchedule(plan([period]));
    expect(schedule.tariff_info.daily_supply_charge).toBe(0);
    expect(schedule.tariff_info.notes?.some((n) => n.includes("supply charge"))).toBe(true);
  });
});
