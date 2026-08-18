// -----------------------------------------------------------------------------
// lib/format.ts
//
// Small, reusable helpers for turning raw numbers into the text shown on
// screen (e.g. turning 1234.5 into "$1,234.50"). Kept separate from the
// simulation engine so formatting/display concerns never get tangled up with
// the actual calculation logic in lib/v2g-simulation.ts.
// -----------------------------------------------------------------------------

/** Formats a number of Australian dollars for display, e.g. 1234.5 -> "$1,234.50". */
export function formatAud(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

/** Formats a payback period in years for display. Returns "N/A" for null (which
 * lib/v2g-simulation.ts returns when a scenario never actually saves money — see
 * README.md "Locked decisions" #9), otherwise shows one decimal place, e.g. 4.2. */
export function formatPaybackYears(years: number | null): string {
  if (years === null) return "N/A";
  return `${years.toFixed(1)} yrs`;
}

/** Formats a survival-hours number for display. Whole hours show as e.g. "14h";
 * anything with a fractional hour shows one decimal, e.g. "14.5h". If the outage
 * simulation hit its safety cap without running out (see OUTAGE_SIMULATION_CAP_HOURS
 * in lib/constants.ts), display it as "168+h" rather than a specific number, since
 * we don't actually know how much further it would have lasted. */
export function formatSurvivalHours(hours: number, exhausted: boolean): string {
  if (!exhausted) return `${Math.floor(hours)}+h`;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** Formats a percentage value (0-100) for display, e.g. 42.5 -> "43%". Rounds to
 * the nearest whole number since sub-percent precision isn't meaningful to show
 * on a slider or a chart label. */
export function formatPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** Formats an hour-of-day number (0-23) as a familiar 12-hour clock label, e.g.
 * 18 -> "6:00 PM". Used by the departure/arrival/blackout-hour controls. */
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

/** A shorter version of formatHour for tight spaces like a chart's x-axis,
 * e.g. 18 -> "6pm", 0 -> "12am". Dropping the ":00" and using lowercase
 * am/pm keeps the axis from getting crowded across 24 hourly ticks. */
export function formatHourShort(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}${period}`;
}

/** Formats the DIFFERENCE between two survival-hours numbers (e.g. "how many
 * more hours did having the EV connected buy you?") for the Executive
 * Summary's resilience card. Always non-negative by construction — the
 * combined (stationary + EV) survival time can never be less than the
 * stationary-only time, since the EV can only ever add energy, never take it
 * away — so this only ever reads as "+Xh", never a negative number. */
export function formatHoursDelta(deltaHours: number): string {
  const roundedHours = Math.round(deltaHours);
  return `+${roundedHours}h`;
}
