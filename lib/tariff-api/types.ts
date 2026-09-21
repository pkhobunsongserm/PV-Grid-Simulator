// -----------------------------------------------------------------------------
// lib/tariff-api/types.ts
//
// The parts of the Consumer Data Right (CDR) energy "Product Reference Data"
// responses that this app actually reads — NOT the full spec (which is huge).
// The AER publishes real retail electricity plans through this API; see
// https://www.aer.gov.au/energy-product-reference-data.
//
// Almost every number in these responses arrives as a STRING (e.g.
// unitPrice: "0.2738"), which is why the fields below are typed as strings and
// converted to numbers in to-schedule.ts.
// -----------------------------------------------------------------------------

/** A plan as it appears in the (brand-wide) plan list — enough to pick one. */
export interface PlanSummary {
  planId: string;
  displayName: string;
  /** Network(s) the plan is sold on, e.g. "AusNet Services (electricity)". */
  distributors: string[];
  /** Postcodes the plan is available in. Absent = no restriction stated. */
  includedPostcodes?: string[];
  /** Postcodes the plan is NOT available in. */
  excludedPostcodes?: string[];
}

export type CdrDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" | "PUBLIC_HOLIDAYS";

export interface CdrRate {
  unitPrice: string;
  /** Present on "stepped" rates: this price applies up to this volume (kWh). */
  volume?: number;
}

export interface CdrTimeWindow {
  days?: CdrDay[];
  /** "HH:MM" (optionally with seconds / offset — only HH:MM is read). */
  startTime?: string;
  endTime?: string;
}

export interface CdrTimeOfUseRate {
  displayName: string;
  /** PEAK | OFF_PEAK | SHOULDER | SHOULDER1 | SHOULDER2 */
  type: string;
  rates: CdrRate[];
  timeOfUse?: CdrTimeWindow[];
}

export interface CdrTariffPeriod {
  displayName?: string;
  /** "MM-DD" */
  startDate: string;
  endDate: string;
  rateBlockUType: "singleRate" | "timeOfUseRates" | "demandCharges";
  dailySupplyCharge?: string;
  bandedDailySupplyCharges?: { unitPrice: string; volume?: number }[];
  singleRate?: { rates?: CdrRate[]; generalUnitPrice?: string };
  timeOfUseRates?: CdrTimeOfUseRate[];
  demandCharges?: unknown[];
}

export interface CdrSolarFeedInTariff {
  scheme?: string;
  payerType?: string;
  displayName?: string;
  tariffUType: "singleTariff" | "timeVaryingTariffs";
  singleTariff?: { rates: CdrRate[] };
  timeVaryingTariffs?: {
    displayName?: string;
    rates?: CdrRate[];
    timeVariations: CdrTimeWindow[];
  }[];
}

export interface PlanDetail {
  planId: string;
  displayName: string;
  brandName: string;
  electricityContract?: {
    pricingModel?: string;
    tariffPeriod: CdrTariffPeriod[];
    solarFeedInTariff?: CdrSolarFeedInTariff[];
    controlledLoad?: unknown[];
  };
}
