// -----------------------------------------------------------------------------
// lib/assumptions.ts
//
// User-facing text for the app's simplifying assumptions — the same ground
// covered by design-document.md's "Locked decisions", but rewritten for a
// visitor to this deployed app, not a developer reading the repo. That
// document isn't shipped with the app at all, so a rendered UI string that
// said "see README.md" or "Locked decisions #4" was pointing people at
// something they could never actually open — this file exists so every
// in-app reference to an assumption points at content that's actually here.
//
// Single source of truth for both the full write-up (AssumptionsPanel) and
// the short inline pointers scattered next to the sliders/cards each one
// affects (InfoLink) — every InfoLink's `id` must match one of these, so the
// two can never drift out of sync or link to a heading that doesn't exist.
// -----------------------------------------------------------------------------

export interface Assumption {
  /** Matches the URL fragment InfoLink points to (`#assumption-<id>`) and the
   * anchor AssumptionsPanel renders each entry under. */
  id: string;
  title: string;
  /** 1-3 plain-language sentences — no internal file names, no jargon that
   * assumes the reader has seen the codebase. */
  detail: string;
}

export const ASSUMPTIONS: Assumption[] = [
  {
    id: "tariff",
    title: "The tariff is fixed, not your own plan",
    detail:
      "Import/export rates and when Off-Peak, Solar Sponge, and Evening Peak apply all come from one real Melbourne time-of-use schedule, and can't be edited here. If your actual plan's rates or period boundaries differ, treat every dollar figure as directional, not an exact quote.",
  },
  {
    id: "scaling",
    title: "Solar and demand curves are scaled, not re-simulated",
    detail:
      "Moving the Solar Capacity or Household Demand sliders proportionally stretches one reference day's real hourly shape, rather than modeling a different roof, orientation, or climate. The panel-to-inverter ratio (about 1.32:1) is assumed to hold at every system size, since inverter size isn't its own setting.",
  },
  {
    id: "no-grid-charging",
    title: "The two batteries charge from the grid very differently",
    detail:
      "The stationary battery only ever charges from solar surplus — never the grid, at any tariff period, so its cost model is always \"free to fill.\" The EV is the opposite: like a real EV charger, it starts drawing power the moment it's plugged in, using solar first and topping up the rest from the grid. By default it waits out Evening Peak (the day's most expensive rate) before doing that grid top-up, resuming the moment Off-Peak or Solar Sponge starts — turn off \"Avoid peak-price grid charging\" to see it import at Evening Peak rates instead, which can meaningfully hurt Payback Years if the EV arrives home needing a real top-up during that window.",
  },
  {
    id: "reserve-floor",
    title: "The two batteries protect their floor differently, on purpose",
    detail:
      "Stationary Reserve SoC is a floor only during normal, day-to-day operation — during a simulated blackout the home battery is allowed to run all the way to 0%, since that reserve is exactly what backup power draws on. The EV's Discharge Floor holds firm even during a blackout, so there's still enough charge left to drive away.",
  },
  {
    id: "reserve-timing",
    title: "Reserve SoC's effect on Survival Hours depends on the blackout's timing",
    detail:
      "Reserve SoC only ever limits discharging, never charging — so if a blackout starts late in the day, that day's solar surplus may have already refilled the battery to nearly the same level no matter what the reserve was set to, making Reserve SoC barely move Survival Hours. The default Blackout Start Time (6:00 AM) is deliberately set before that day's solar has run, so a higher reserve visibly buys more backup time out of the box — move Blackout Start Time later and the effect shrinks.",
  },
  {
    id: "outage",
    title: "The outage simulator is worst-case, on purpose",
    detail:
      "During a simulated blackout, only critical (not full-house) load is served, there's no buying or selling to the grid, and no solar recharging is assumed at all — even in broad daylight. The EV only helps if it happened to be plugged in the instant the outage began, and that plugged-in/away status is frozen for the entire simulated outage. A result that never runs out within a simulated week displays as \"Infinite\" rather than a specific number.",
  },
  {
    id: "matrix",
    title: "The sensitivity matrix only sweeps the stationary battery",
    detail:
      "Reserve SoC% and Stationary Capacity are what actually vary across the grid; EV capacity stays fixed at whatever you've configured elsewhere, since it's treated as a car already owned, not a sizing decision. Use the \"Battery Only\" / \"+ EV\" toggle above the table — for Survival Hours, with an EV in the household, the \"+ EV\" view can look flat across a whole row simply because the EV's fixed capacity dwarfs the stationary battery's own effect. For Payback Years, \"Battery Only\" and \"+ EV\" are two genuinely different simulated days (the EV's charger cost and its own charging/V2G behavior are only counted in \"+ EV\"), not just two ways of reading the same number.",
  },
  {
    id: "financials",
    title: "Costs are editable defaults, and one day stands in for a year",
    detail:
      "Battery, solar, and V2G-charger costs start from typical Australian-market $/kWh, $/kW, and flat-fee defaults — not a real quote — and can be adjusted under \"Advanced: Cost Assumptions.\" The EV itself is never counted as a cost, only the charger. Annual savings simply multiply one representative day's savings by 365, with no seasonal or weekday/weekend variation modeled.",
  },
  {
    id: "starting-soc",
    title: "Both batteries assume a starting charge level",
    detail:
      "By default the stationary battery starts each simulated day sitting exactly at its Reserve SoC, and the EV starts at 80% (\"charged up overnight\") — both are adjustable via their own Starting Charge sliders, but that's what a fresh scenario assumes until you change them.",
  },
  {
    id: "ev-charge-cap",
    title: "The EV has its own charge ceiling, separate from its floor",
    detail:
      "Max Charge Cap (default 80%, adjustable 50-100%) mirrors a real EV owner's own charge-limit setting — the EV is never charged, from solar or the grid, above this line, any hour of the day, including after it recharges from a V2G discharge. It only limits future charging: if the EV's Starting Charge is set above the cap, it isn't forced down, it simply won't charge any higher until it naturally drops back under.",
  },
];
