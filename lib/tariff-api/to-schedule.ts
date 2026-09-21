// -----------------------------------------------------------------------------
// lib/tariff-api/to-schedule.ts
//
// Turns one real retail plan (as published by the AER) into the simulator's
// TariffSchedule: 24 hourly import rates, 24 hourly export rates, and a daily
// supply charge. This is a deliberate SIMPLIFICATION — real plans have
// weekday/weekend rates, seasons, stepped pricing, demand charges and more,
// while the simulator models one representative day. Anything that gets
// flattened away is reported in `tariff_info.notes` so the UI can say so.
//
// How the mapping works:
//   - WEEKDAY rates are used (Mon-Fri). If weekend rates differ, a note says so.
//   - Time windows can start/end mid-hour (e.g. 15:30) or wrap past midnight
//     (21:00 → 00:00). Each hour gets the TIME-WEIGHTED average of its minutes.
//   - Stepped pricing ("first 10 kWh/day at X, the rest at Y"): the LAST step is
//     used for imports, since that's the marginal price a household using
//     typical amounts pays; the FIRST step is used for feed-in tariffs.
//   - GST: the AER publishes usage and supply prices EXCLUDING GST, so import
//     rates and the supply charge get 10% added. Feed-in payments to households
//     carry no GST, so those are used as published.
//   - "Peak" (`isPeak`) = the plan's most expensive band of hours (see below).
// -----------------------------------------------------------------------------

import type { TariffHourEntry, TariffSchedule } from "@/lib/types";
import type {
  CdrDay,
  CdrRate,
  CdrSolarFeedInTariff,
  CdrTariffPeriod,
  CdrTimeWindow,
  PlanDetail,
} from "./types";

export const GST_MULTIPLIER = 1.1;

/** The plan is valid, but its pricing structure can't be represented. */
export class UnsupportedPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPlanError";
  }
}

const MINUTES_PER_DAY = 1440;
const WEEKDAYS: CdrDay[] = ["MON", "TUE", "WED", "THU", "FRI"];
const WEEKEND_DAYS: CdrDay[] = ["SAT", "SUN"];
type DayGroup = "weekday" | "weekend";

// A gap between the cheapest and dearest hour smaller than this ($/kWh) is
// treated as "flat" — there's no meaningful peak to avoid or discharge into.
const MIN_PEAK_SPREAD = 0.03;
// Hours priced in the top quarter of the plan's price range count as "peak".
const PEAK_BAND_FRACTION = 0.75;
// A weekday/weekend hourly difference above this ($/kWh) is worth flagging.
const WEEKEND_DIFF_TOLERANCE = 0.005;

// ---------- small helpers ----------

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** "15:30" / "1530" / "15:30:00" → minutes since midnight. Unparseable → fallback. */
function parseMinutes(time: string | undefined, fallback: number, isEnd = false): number {
  if (!time) return fallback;
  const m = /^(\d{1,2}):?(\d{2})/.exec(time);
  if (!m) return fallback;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  // "23:59" / "24:00" as an END time both mean "end of day".
  if (isEnd && minutes >= MINUTES_PER_DAY - 1) return MINUTES_PER_DAY;
  return Math.min(minutes, MINUTES_PER_DAY);
}

function appliesTo(days: CdrDay[] | undefined, group: DayGroup): boolean {
  if (!days || days.length === 0) return true; // no days stated = every day
  const wanted = group === "weekday" ? WEEKDAYS : WEEKEND_DAYS;
  return days.some((d) => wanted.includes(d));
}

/** The [start, end) minute ranges a window covers; a wrapping window becomes two. */
function segmentsOf(window: CdrTimeWindow): [number, number][] {
  const start = parseMinutes(window.startTime, 0);
  const end = parseMinutes(window.endTime, MINUTES_PER_DAY, true);
  if (end > start) return [[start, end]];
  // end <= start: wraps past midnight (start === end means the whole day).
  return [
    [start, MINUTES_PER_DAY],
    [0, end],
  ];
}

/** Picks a price from a list of (possibly stepped) rates. `which` = which step. */
function pickPrice(rates: CdrRate[] | undefined, which: "first" | "last"): number {
  if (!rates || rates.length === 0) return NaN;
  return Number(which === "last" ? rates[rates.length - 1].unitPrice : rates[0].unitPrice);
}

function isStepped(rates: CdrRate[] | undefined): boolean {
  if (!rates || rates.length < 2) return false;
  return new Set(rates.map((r) => Number(r.unitPrice))).size > 1;
}

interface RateBand {
  rate: number;
  label: string;
  windows: CdrTimeWindow[] | undefined;
}

interface MinuteSlot {
  rate: number;
  label: string;
}

/** Spreads bands across a 1440-minute day for one group of days. Earlier bands
 * win overlaps; bands with no windows only fill whatever is left. */
function fillMinutes(bands: RateBand[], group: DayGroup): (MinuteSlot | null)[] {
  const minutes: (MinuteSlot | null)[] = new Array(MINUTES_PER_DAY).fill(null);
  const paint = (band: RateBand, start: number, end: number) => {
    for (let m = start; m < end; m++) {
      if (minutes[m] === null) minutes[m] = { rate: band.rate, label: band.label };
    }
  };

  for (const band of bands) {
    for (const w of band.windows ?? []) {
      if (!appliesTo(w.days, group)) continue;
      for (const [s, e] of segmentsOf(w)) paint(band, s, e);
    }
  }
  // Bands with no time windows mean "all other times".
  for (const band of bands) {
    if (band.windows && band.windows.length > 0) continue;
    paint(band, 0, MINUTES_PER_DAY);
  }
  return minutes;
}

/** Time-weighted average rate per hour, plus each hour's dominant label. */
function hourlyFromMinutes(
  minutes: (MinuteSlot | null)[],
  gapFill: MinuteSlot
): { rates: number[]; labels: string[]; hadGaps: boolean } {
  const rates: number[] = [];
  const labels: string[] = [];
  let hadGaps = false;

  for (let hour = 0; hour < 24; hour++) {
    let total = 0;
    const labelMinutes = new Map<string, number>();
    for (let m = hour * 60; m < hour * 60 + 60; m++) {
      let slot = minutes[m];
      if (slot === null) {
        hadGaps = true;
        slot = gapFill;
      }
      total += slot.rate;
      labelMinutes.set(slot.label, (labelMinutes.get(slot.label) ?? 0) + 1);
    }
    rates.push(total / 60);
    labels.push(Array.from(labelMinutes.entries()).sort((a, b) => b[1] - a[1])[0][0]);
  }
  return { rates, labels, hadGaps };
}

const TYPE_LABELS: Record<string, string> = {
  PEAK: "Peak",
  OFF_PEAK: "Off-peak",
  SHOULDER: "Shoulder",
  SHOULDER1: "Shoulder 1",
  SHOULDER2: "Shoulder 2",
};

/** Is `mmdd` ("MM-DD") inside a period that runs start→end (may wrap the new year)? */
function periodCovers(period: CdrTariffPeriod, mmdd: string): boolean {
  return period.startDate <= period.endDate
    ? mmdd >= period.startDate && mmdd <= period.endDate
    : mmdd >= period.startDate || mmdd <= period.endDate;
}

// ---------- import rates ----------

interface ImportProfile {
  weekday: { rates: number[]; labels: string[] };
  weekendRates: number[] | null; // null when it can't differ (single flat rate)
  notes: string[];
}

function buildImportProfile(period: CdrTariffPeriod): ImportProfile {
  const notes: string[] = [];
  const tou = period.timeOfUseRates;

  if (tou && tou.length > 0) {
    const bands: RateBand[] = tou.map((t) => ({
      rate: pickPrice(t.rates, "last") * GST_MULTIPLIER,
      label: TYPE_LABELS[t.type] ?? t.displayName,
      windows: t.timeOfUse,
    }));
    if (bands.some((b) => Number.isNaN(b.rate))) {
      throw new UnsupportedPlanError("This plan's time-of-use rates couldn't be read.");
    }
    if (tou.some((t) => isStepped(t.rates))) {
      notes.push("Stepped pricing: the highest usage step's rate is used.");
    }

    // Anything the windows leave uncovered is assumed to be the cheapest rate.
    const cheapest = bands.reduce((a, b) => (b.rate < a.rate ? b : a));
    const gapFill: MinuteSlot = { rate: cheapest.rate, label: cheapest.label };

    const weekday = hourlyFromMinutes(fillMinutes(bands, "weekday"), gapFill);
    const weekend = hourlyFromMinutes(fillMinutes(bands, "weekend"), gapFill);
    if (weekday.hadGaps) {
      notes.push("Some hours weren't covered by the plan's time windows; the cheapest rate is assumed.");
    }
    return { weekday, weekendRates: weekend.rates, notes };
  }

  const single = period.singleRate?.rates;
  const price = pickPrice(single, "last") * GST_MULTIPLIER;
  if (Number.isNaN(price)) {
    throw new UnsupportedPlanError("This plan's pricing structure can't be modelled here.");
  }
  if (isStepped(single)) notes.push("Stepped pricing: the highest usage step's rate is used.");

  return {
    weekday: { rates: new Array(24).fill(price), labels: new Array(24).fill("Flat rate") },
    weekendRates: null,
    notes,
  };
}

// ---------- export (feed-in) rates ----------

/**
 * The feed-in tariff a NEW customer would get. Plans often list several: the
 * retailer's current offer, plus closed legacy schemes (scheme PREMIUM, or paid
 * by a GOVERNMENT program for already-enrolled households — e.g. a plan can list
 * "Customer Group 1" at 44c alongside a 0.5c retailer rate). Legacy schemes are
 * skipped, since applying them would wildly overstate export income.
 */
function chooseFeedIn(fits: CdrSolarFeedInTariff[] | undefined): CdrSolarFeedInTariff | undefined {
  const open = (fits ?? []).filter((f) => f.payerType !== "GOVERNMENT" && f.scheme !== "PREMIUM");
  return open.find((f) => f.scheme === "CURRENT") ?? open[0];
}

function buildExportRates(fit: CdrSolarFeedInTariff | undefined, notes: string[]): number[] {
  if (!fit) {
    notes.push("No current solar feed-in tariff is listed for this plan; exported energy earns nothing.");
    return new Array(24).fill(0);
  }

  if (fit.tariffUType === "timeVaryingTariffs" && fit.timeVaryingTariffs?.length) {
    const bands: RateBand[] = fit.timeVaryingTariffs.map((t) => ({
      rate: pickPrice(t.rates, "first"),
      label: t.displayName ?? "Feed-in",
      windows: t.timeVariations,
    }));
    if (bands.every((b) => !Number.isNaN(b.rate))) {
      // Uncovered times earn nothing (conservative).
      const { rates } = hourlyFromMinutes(fillMinutes(bands, "weekday"), { rate: 0, label: "" });
      return rates;
    }
  } else if (fit.tariffUType === "singleTariff" && fit.singleTariff) {
    const price = pickPrice(fit.singleTariff.rates, "first");
    if (!Number.isNaN(price)) {
      if (isStepped(fit.singleTariff.rates)) {
        notes.push("Feed-in tariff has usage steps; the first step's rate is used.");
      }
      return new Array(24).fill(price);
    }
  }

  notes.push("This plan's feed-in tariff couldn't be read; exported energy is assumed to earn nothing.");
  return new Array(24).fill(0);
}

// ---------- supply charge ----------

function dailySupplyCharge(period: CdrTariffPeriod, notes: string[]): number {
  let ex = Number(period.dailySupplyCharge);
  if (period.dailySupplyCharge === undefined || Number.isNaN(ex)) {
    const banded = period.bandedDailySupplyCharges?.[0];
    ex = banded ? Number(banded.unitPrice) : NaN;
  }
  if (Number.isNaN(ex)) {
    notes.push("No daily supply charge is listed for this plan; it's assumed to be $0.");
    return 0;
  }
  return ex * GST_MULTIPLIER;
}

// ---------- main entry point ----------

/**
 * Maps a plan's detail response to a TariffSchedule. Throws UnsupportedPlanError
 * if the plan has no usable energy prices (rather than silently guessing).
 * `now` selects which season applies for plans with seasonal prices.
 */
export function planToTariffSchedule(detail: PlanDetail, now: Date = new Date()): TariffSchedule {
  const contract = detail.electricityContract;
  if (!contract || !contract.tariffPeriod || contract.tariffPeriod.length === 0) {
    throw new UnsupportedPlanError("This plan has no electricity pricing to model.");
  }

  const notes: string[] = [];
  const periods = contract.tariffPeriod;
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const period = periods.find((p) => periodCovers(p, mmdd)) ?? periods[0];
  if (periods.length > 1) {
    notes.push(`Prices change through the year (${periods.length} seasons); today's season is used.`);
  }

  if (period.rateBlockUType === "demandCharges" || (period.demandCharges?.length ?? 0) > 0) {
    notes.push("Demand charges (a fee based on your peak kW) aren't modelled.");
  }
  if ((contract.controlledLoad?.length ?? 0) > 0) {
    notes.push("Controlled-load (e.g. off-peak hot water) pricing isn't modelled.");
  }

  const imports = buildImportProfile(period);
  notes.push(...imports.notes);

  const { rates: importRates, labels } = imports.weekday;
  if (imports.weekendRates) {
    const differs = importRates.some(
      (r, h) => Math.abs(r - imports.weekendRates![h]) > WEEKEND_DIFF_TOLERANCE
    );
    if (differs) notes.push("Weekend rates differ from weekday rates; weekday rates are used.");
  }

  // Peak = the top band of the plan's price range. A flat plan has none.
  const min = Math.min(...importRates);
  const max = Math.max(...importRates);
  const hasPeak = max - min >= MIN_PEAK_SPREAD;
  const peakThreshold = min + PEAK_BAND_FRACTION * (max - min);
  if (!hasPeak) {
    notes.push("Rates barely vary through the day, so there's no peak period to discharge V2G into or avoid.");
  }

  const exportRates = buildExportRates(chooseFeedIn(contract.solarFeedInTariff), notes);

  const hourly_schedule: TariffHourEntry[] = importRates.map((rate, hour) => {
    const isPeak = hasPeak && rate >= peakThreshold - 1e-9;
    return {
      hour,
      period: isPeak ? "Peak" : labels[hour],
      isPeak,
      import_rate_per_kwh: round5(rate),
      export_rate_per_kwh: round5(exportRates[hour]),
    };
  });

  const supplyCharge = dailySupplyCharge(period, notes);

  notes.push(
    "Usage and supply prices include 10% GST (the AER publishes them without it). Feed-in tariffs are shown as published."
  );

  return {
    tariff_info: {
      currency: "AUD",
      daily_supply_charge: round5(supplyCharge),
      time_zone: "Australia/Sydney",
      name: detail.displayName,
      retailer: detail.brandName,
      notes,
    },
    hourly_schedule,
  };
}
