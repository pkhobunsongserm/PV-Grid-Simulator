// -----------------------------------------------------------------------------
// lib/tariff-api/filter.ts
//
// The AER's plan list has no "plans for my postcode" option, so we filter it
// ourselves using each plan's stated availability.
// -----------------------------------------------------------------------------

import type { PlanSummary } from "./types";

/** Australian postcodes are exactly four digits. */
export function isValidPostcode(postcode: string): boolean {
  return /^\d{4}$/.test(postcode);
}

/**
 * Plans sold at `postcode`, sorted by name. A plan is available if the postcode
 * is in its `includedPostcodes` (when it lists any) and not in its
 * `excludedPostcodes`. A plan listing neither has no stated restriction.
 */
export function plansForPostcode(plans: PlanSummary[], postcode: string): PlanSummary[] {
  return plans
    .filter((p) => {
      if (p.excludedPostcodes?.includes(postcode)) return false;
      if (p.includedPostcodes && p.includedPostcodes.length > 0) {
        return p.includedPostcodes.includes(postcode);
      }
      return true;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
