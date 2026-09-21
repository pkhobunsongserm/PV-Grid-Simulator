// -----------------------------------------------------------------------------
// components/controls/TariffDisplay.tsx
//
// A READ-ONLY table of the 24-hour tariff currently in use — either the built-in
// schedule from data/tou_tariff.json or the plan picked in PlanSelector.tsx.
// There are no sliders here on purpose: hand-editing rates would let the UI
// drift from real published prices (see README.md "Locked decisions" #1) —
// change the tariff by picking a plan instead. Collapsed by default
// (defaultOpen={false}) since most users will only want to glance at it
// occasionally, not have it taking up space every time they open the sidebar.
// -----------------------------------------------------------------------------
"use client";

import { Receipt } from "lucide-react";
import { ControlSection } from "@/components/layout/ControlSection";
import { InfoLink } from "@/components/common/InfoLink";
import { useSimulationStore } from "@/store/useSimulationStore";
import { formatAud, formatHour } from "@/lib/format";
import type { TariffHourEntry } from "@/lib/types";

const PEAK_STYLE = "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
const OFF_PEAK_STYLE = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

// A small color per tariff period, so the expensive peak window (and, for the
// built-in tariff, the cheap midday "Solar Sponge") are visually obvious at a
// glance, not just readable as text. Colored by `isPeak` rather than by name,
// since a real plan's periods can be called anything ("Shoulder", "Flat rate"...).
function periodStyle(entry: TariffHourEntry): string {
  if (entry.isPeak) return PEAK_STYLE;
  if (entry.period === "Solar Sponge") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  }
  return OFF_PEAK_STYLE;
}

export function TariffDisplay() {
  const tariff = useSimulationStore((state) => state.tariff);
  const isPlan = useSimulationStore((state) => state.planSelection !== null);

  return (
    <ControlSection
      title="Hourly Tariff"
      icon={Receipt}
      description={
        <>
          {isPlan
            ? "The hourly prices derived from your selected plan (weekday rates)."
            : "The built-in Melbourne tariff. Pick a plan above to use a real one instead."}{" "}
          <InfoLink id="tariff" />
        </>
      }
      defaultOpen={false}
    >
      <p className="mb-2 text-xs text-slate-400">
        Daily supply charge: {formatAud(tariff.tariff_info.daily_supply_charge)},
        charged regardless of usage.
      </p>
      <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-1 font-medium">Hour</th>
              <th className="px-2 py-1 font-medium">Period</th>
              <th className="px-2 py-1 font-medium">Import</th>
              <th className="px-2 py-1 font-medium">Export</th>
            </tr>
          </thead>
          <tbody>
            {tariff.hourly_schedule.map((entry) => (
              <tr key={entry.hour} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 tabular-nums">{formatHour(entry.hour)}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-1.5 py-0.5 ${periodStyle(entry)}`}>
                    {entry.period}
                  </span>
                </td>
                <td className="px-2 py-1 tabular-nums">{formatAud(entry.import_rate_per_kwh)}</td>
                <td className="px-2 py-1 tabular-nums">{formatAud(entry.export_rate_per_kwh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ControlSection>
  );
}
