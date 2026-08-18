// -----------------------------------------------------------------------------
// components/controls/TariffDisplay.tsx
//
// A READ-ONLY table of the 24-hour tariff schedule from data/tou_tariff.json.
// There's no slider here on purpose — README.md "Locked decisions" #1 explains
// why tariff editing is out of scope for this version: the JSON schedule is
// the single source of truth for pricing, and letting the UI silently diverge
// from it would undermine that. Collapsed by default (defaultOpen={false})
// since most users will only want to glance at it occasionally, not have it
// taking up space every time they open the sidebar.
// -----------------------------------------------------------------------------
"use client";

import { Receipt } from "lucide-react";
import { ControlSection } from "@/components/layout/ControlSection";
import { tariffSchedule } from "@/lib/reference-data";
import { formatAud, formatHour } from "@/lib/format";
import type { TariffHourEntry } from "@/lib/types";

// A small color per tariff period, so the cheap "Solar Sponge" window and the
// expensive "Evening Peak" window are visually obvious at a glance, not just
// readable as text.
const PERIOD_STYLES: Record<TariffHourEntry["period"], string> = {
  "Off-Peak": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "Solar Sponge": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "Evening Peak": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export function TariffDisplay() {
  return (
    <ControlSection
      title="Time-of-Use Tariff"
      icon={Receipt}
      description="Read-only in this version — see README.md 'Locked decisions' #1."
      defaultOpen={false}
    >
      <p className="mb-2 text-xs text-slate-400">
        Daily supply charge: {formatAud(tariffSchedule.tariff_info.daily_supply_charge)},
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
            {tariffSchedule.hourly_schedule.map((entry) => (
              <tr key={entry.hour} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 tabular-nums">{formatHour(entry.hour)}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-1.5 py-0.5 ${PERIOD_STYLES[entry.period]}`}>
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
