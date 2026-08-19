// -----------------------------------------------------------------------------
// lib/__tests__/format.test.ts
//
// Automated checks for the small display-formatting helpers in lib/format.ts.
// These functions are the LAST step before a number reaches the screen — every
// dollar figure, percentage, hour label, and survival-hours reading the user
// sees passes through one of them. They're simple, but simple formatting code
// is exactly the kind of thing that's easy to break in a small refactor (e.g.
// swapping a `<` for a `<=`, or forgetting a branch) without noticing, because
// nothing about a wrong label crashes the app or looks obviously broken in a
// quick click-through. Run these with `npm test`, same as
// lib/__tests__/v2g-simulation.test.ts.
// -----------------------------------------------------------------------------

import { describe, expect, test } from "vitest";

import {
  formatAud,
  formatPaybackYears,
  formatSurvivalHours,
  formatPercent,
  formatHour,
  formatHourShort,
  formatHoursDelta,
} from "@/lib/format";

describe("format helpers", () => {
  // ---------------------------------------------------------------------------
  // formatAud: a normal positive amount should come out as Australian-locale
  // currency with a dollar sign, thousands separator, and 2 decimal places.
  // ---------------------------------------------------------------------------
  test("formatAud formats a positive amount as AUD currency", () => {
    expect(formatAud(1234.5)).toBe("$1,234.50");
  });

  // ---------------------------------------------------------------------------
  // formatAud: a negative amount (e.g. a scenario that COSTS money rather than
  // saving it) should still render sensibly — a minus sign and the same
  // currency formatting, not something broken like a missing sign or "NaN".
  // ---------------------------------------------------------------------------
  test("formatAud formats a negative amount with a minus sign, not something broken", () => {
    expect(formatAud(-500.25)).toBe("-$500.25");
  });

  // ---------------------------------------------------------------------------
  // formatPaybackYears: null is what lib/v2g-simulation.ts's computeFinancials()
  // returns when a scenario never actually pays for itself (annualSavings <= 0
  // — see README.md "Locked decisions" #9). That has to render as "N/A", never
  // as "null", "NaN", or a made-up number.
  // ---------------------------------------------------------------------------
  test('formatPaybackYears renders null as exactly "N/A"', () => {
    expect(formatPaybackYears(null)).toBe("N/A");
  });

  // ---------------------------------------------------------------------------
  // formatPaybackYears: a normal number shows to one decimal place, with a
  // " yrs" suffix. 10.14 is the exact number from Phase 3's dev-log verification
  // pass (docs/dev-log/phase-3-store-and-sidebar.md) of the Reserve SoC slider's
  // effect on payback, so this also happens to double-check that real number
  // formats the way that dev-log entry says it did.
  // ---------------------------------------------------------------------------
  test("formatPaybackYears renders a normal number to one decimal place", () => {
    expect(formatPaybackYears(10.14)).toBe("10.1 yrs");
  });

  // ---------------------------------------------------------------------------
  // formatSurvivalHours, exhausted: false branch — this is the "hit the
  // simulation's safety cap without running out" case (see
  // OUTAGE_SIMULATION_CAP_HOURS in lib/constants.ts). We genuinely don't know
  // how much further the system would have lasted past the cap, so this
  // renders as the fixed string "Infinite" — deliberately ignoring the exact
  // `hours` value passed in (168.4 vs. 168.9 makes no difference), since any
  // specific number here would imply more precision than the simulation
  // actually has.
  // ---------------------------------------------------------------------------
  test('formatSurvivalHours renders "Infinite" when exhausted is false, regardless of the hours value', () => {
    expect(formatSurvivalHours(168.4, false)).toBe("Infinite");
    expect(formatSurvivalHours(168.9, false)).toBe("Infinite");
  });

  // ---------------------------------------------------------------------------
  // formatSurvivalHours, exhausted: true, under 24 hours — no "0d" prefix
  // should appear; this should read exactly like a plain hours figure, with
  // the same whole-vs-fractional-hour behavior as before (whole hours get no
  // decimal, e.g. "18h" not "18.0h").
  // ---------------------------------------------------------------------------
  test("formatSurvivalHours renders a plain hours figure with no day count when under 24 hours", () => {
    expect(formatSurvivalHours(18, true)).toBe("18h");
    expect(formatSurvivalHours(14.5, true)).toBe("14.5h");
  });

  // ---------------------------------------------------------------------------
  // formatSurvivalHours, exhausted: true, 24 hours or more — now broken into
  // a day count plus the remaining hours, e.g. 30.5 hours is 1 full day and
  // 6.5 leftover hours, not "30.5h".
  // ---------------------------------------------------------------------------
  test("formatSurvivalHours breaks 24+ hours into days and hours", () => {
    expect(formatSurvivalHours(30.5, true)).toBe("1d 6.5h");
    expect(formatSurvivalHours(48, true)).toBe("2d 0h");
    // 168 is the outage simulator's own safety cap (OUTAGE_SIMULATION_CAP_HOURS)
    // — exactly 7 days, with exhausted:true meaning it ran out at PRECISELY the
    // cap rather than surviving past it (see the "Infinite" test above for the
    // "survived the whole cap" case).
    expect(formatSurvivalHours(168, true)).toBe("7d 0h");
  });

  // ---------------------------------------------------------------------------
  // formatPercent: a normal, unambiguous value.
  // ---------------------------------------------------------------------------
  test("formatPercent rounds a normal value to the nearest whole percent", () => {
    expect(formatPercent(42.5)).toBe("43%");
  });

  // ---------------------------------------------------------------------------
  // formatPercent: a value ending in exactly .5, to pin down which way
  // Math.round() breaks a tie. JavaScript's Math.round() always rounds a .5
  // value UP (toward +Infinity), not to the nearest even number ("banker's
  // rounding") the way some other languages/libraries do — so 2.5% should
  // read as "3%", not "2%".
  // ---------------------------------------------------------------------------
  test("formatPercent rounds a .5 value up, matching Math.round's tie-breaking rule", () => {
    expect(formatPercent(2.5)).toBe("3%");
  });

  // ---------------------------------------------------------------------------
  // formatHour: midnight is the trickiest edge case in a 12-hour clock — hour
  // 0 has to display as "12", not "0", via the `hour % 12 === 0 ? 12 : ...`
  // branch, and it's AM.
  // ---------------------------------------------------------------------------
  test('formatHour renders hour 0 as "12:00 AM" (the midnight edge case)', () => {
    expect(formatHour(0)).toBe("12:00 AM");
  });

  // ---------------------------------------------------------------------------
  // formatHour: noon hits the exact same `% 12 === 0` branch as midnight, but
  // on the PM side — confirming the branch is shared correctly between both
  // edge cases rather than midnight being special-cased separately.
  // ---------------------------------------------------------------------------
  test('formatHour renders hour 12 as "12:00 PM" (the noon edge case)', () => {
    expect(formatHour(12)).toBe("12:00 PM");
  });

  // ---------------------------------------------------------------------------
  // formatHour: an ordinary PM hour, to confirm the non-edge-case path.
  // ---------------------------------------------------------------------------
  test('formatHour renders an ordinary PM hour like 18 as "6:00 PM"', () => {
    expect(formatHour(18)).toBe("6:00 PM");
  });

  // ---------------------------------------------------------------------------
  // formatHourShort: the same three hours as formatHour above, but in the
  // compact chart-axis form (no ":00", lowercase am/pm).
  // ---------------------------------------------------------------------------
  test('formatHourShort renders hour 0 as "12am"', () => {
    expect(formatHourShort(0)).toBe("12am");
  });

  test('formatHourShort renders hour 12 as "12pm"', () => {
    expect(formatHourShort(12)).toBe("12pm");
  });

  test('formatHourShort renders an ordinary PM hour like 18 as "6pm"', () => {
    expect(formatHourShort(18)).toBe("6pm");
  });

  // ---------------------------------------------------------------------------
  // formatHoursDelta: always renders with a leading "+". The function's own
  // source comment argues this is "non-negative by construction" elsewhere in
  // the app (the EV can only ever ADD survival time versus the stationary-only
  // baseline, never subtract from it) — but that's a claim about how the rest
  // of the app calls this function, not something this formatting function
  // itself enforces. This test only checks the formatting logic in isolation:
  // given a positive number, does it prepend "+" and round correctly?
  // ---------------------------------------------------------------------------
  test('formatHoursDelta always prepends a "+" for a positive input', () => {
    expect(formatHoursDelta(88.4)).toBe("+88h");
  });
});
