// -----------------------------------------------------------------------------
// components/results/ExecutiveSummaryCards.tsx
//
// The three headline numbers from the original feature spec: Financial
// Payback, Annual Tariff Savings, and Combined Resilience Backup. Reads the
// current simulation result via useSimulationResult() — no props needed, since
// this component always shows "whatever the sliders are set to right now".
// -----------------------------------------------------------------------------
"use client";

import { TrendingUp, PiggyBank, ShieldCheck } from "lucide-react";
import { useSimulationResult } from "@/hooks/useSimulationResult";
import { useSimulationStore } from "@/store/useSimulationStore";
import { StatCard } from "./StatCard";
import { formatAud, formatPaybackYears, formatSurvivalHours, formatHoursDelta } from "@/lib/format";

export function ExecutiveSummaryCards() {
  const { financials, outageCombined, outageStationaryOnly } = useSimulationResult();
  const ownsEv = useSimulationStore((s) => s.inputs.ev.ownsEv);

  // How many EXTRA hours of blackout survival the EV adds on top of what the
  // stationary battery alone provides. This can never be negative — the EV
  // only ever adds energy to the outage simulation, never removes it — so a
  // value of exactly 0 specifically means "the EV wasn't plugged in at the
  // moment the blackout started" or "the stationary battery alone already
  // lasted the full simulated week", not an error.
  const extraHoursFromEv = outageCombined.survivalHours - outageStationaryOnly.survivalHours;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Financial payback"
        icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
        value={formatPaybackYears(financials.paybackYears)}
        caption={`on ${formatAud(financials.totalCapex)} invested`}
      />

      <StatCard
        label="Annual tariff savings"
        icon={<PiggyBank className="h-4 w-4" aria-hidden="true" />}
        value={formatAud(financials.annualSavings)}
        caption={`${formatAud(financials.dailySavings)}/day, extrapolated from one representative day`}
      />

      <StatCard
        label={ownsEv ? "Combined resilience backup" : "Resilience backup"}
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        value={formatSurvivalHours(outageCombined.survivalHours, outageCombined.exhausted)}
        delta={
          // With no EV, there's nothing to compare against — dropping the
          // delta line entirely avoids the misleading "no added benefit from
          // the EV" wording, which reads as "you have one, it just didn't
          // help" rather than "you don't have one". With an EV, the existing
          // good/neutral distinction is unchanged.
          !ownsEv
            ? undefined
            : extraHoursFromEv > 0
              ? { text: `${formatHoursDelta(extraHoursFromEv)} vs. stationary battery only`, tone: "good" }
              : { text: "no added benefit from the EV in this scenario", tone: "neutral" }
        }
        caption={
          // With no EV, outageCombined already equals outageStationaryOnly —
          // showing both numbers would just repeat the headline value, so the
          // "stationary alone" comparison line only makes sense when there's
          // an EV to compare against.
          ownsEv
            ? `stationary alone: ${formatSurvivalHours(outageStationaryOnly.survivalHours, outageStationaryOnly.exhausted)}`
            : undefined
        }
      />
    </div>
  );
}
