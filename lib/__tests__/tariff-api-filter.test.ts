// -----------------------------------------------------------------------------
// lib/__tests__/tariff-api-filter.test.ts
//
// Checks postcode filtering of a retailer's plan list (lib/tariff-api/filter.ts).
// -----------------------------------------------------------------------------

import { describe, expect, test } from "vitest";

import { isValidPostcode, plansForPostcode } from "@/lib/tariff-api/filter";
import type { PlanSummary } from "@/lib/tariff-api/types";

const plan = (over: Partial<PlanSummary> & { planId: string }): PlanSummary => ({
  displayName: over.planId,
  distributors: ["Some Network"],
  ...over,
});

describe("plansForPostcode", () => {
  test("keeps plans that list the postcode, drops those that don't", () => {
    const plans = [
      plan({ planId: "in", includedPostcodes: ["3000", "3001"] }),
      plan({ planId: "out", includedPostcodes: ["2000"] }),
    ];
    expect(plansForPostcode(plans, "3000").map((p) => p.planId)).toEqual(["in"]);
  });

  test("excluded postcodes are removed even when the postcode is also included", () => {
    const plans = [plan({ planId: "x", includedPostcodes: ["3000"], excludedPostcodes: ["3000"] })];
    expect(plansForPostcode(plans, "3000")).toEqual([]);
  });

  test("a plan stating no restriction is available everywhere; exclusions still apply", () => {
    const plans = [
      plan({ planId: "anywhere" }),
      plan({ planId: "not-3000", excludedPostcodes: ["3000"] }),
    ];
    expect(plansForPostcode(plans, "3000").map((p) => p.planId)).toEqual(["anywhere"]);
    expect(plansForPostcode(plans, "4000").map((p) => p.planId)).toEqual(["anywhere", "not-3000"]);
  });

  test("results are sorted by plan name", () => {
    const plans = [
      plan({ planId: "b", displayName: "Zebra" }),
      plan({ planId: "a", displayName: "Apple" }),
    ];
    expect(plansForPostcode(plans, "3000").map((p) => p.displayName)).toEqual(["Apple", "Zebra"]);
  });
});

describe("isValidPostcode", () => {
  test("requires exactly four digits", () => {
    expect(isValidPostcode("3000")).toBe(true);
    expect(isValidPostcode("300")).toBe(false);
    expect(isValidPostcode("30000")).toBe(false);
    expect(isValidPostcode("30a0")).toBe(false);
    expect(isValidPostcode("")).toBe(false);
  });
});
