// -----------------------------------------------------------------------------
// components/results/StatCard.tsx
//
// A single "headline number" tile — label, big value, and an optional colored
// delta line underneath (e.g. "+88h with EV"). All three Executive Summary
// cards render through this one component so they stay visually consistent.
//
// Deliberately NOT a chart: per the project's data-visualization guidelines, a
// single current value is a "stat tile", not a one-bar bar chart — the number
// itself is the whole point, so nothing here tries to dress it up as a plot.
// -----------------------------------------------------------------------------

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  /** Small icon shown next to the label, purely decorative/identifying — never
   * the only way to tell the cards apart (the label text always does that). */
  icon: ReactNode;
  /** Optional colored line below the value, e.g. "+88h with EV connected".
   * Color should be chosen by the CALLER based on whether this particular
   * change is actually good news — see ExecutiveSummaryCards.tsx. */
  delta?: { text: string; tone: "good" | "neutral" };
  /** Optional small gray line below everything else, for extra context that
   * doesn't need visual emphasis (e.g. "on $26,920 invested"). */
  caption?: string;
}

export function StatCard({ label, value, icon, delta, caption }: StatCardProps) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        // These come from the app's validated chart palette (see
        // app/globals.css), not the sliders' emerald accent — a stat tile is
        // a data visualization component, not ordinary page chrome.
        backgroundColor: "var(--chart-surface)",
        borderColor: "var(--chart-border)",
      }}
    >
      <div className="mb-1 flex items-center gap-1.5" style={{ color: "var(--chart-text-secondary)" }}>
        {icon}
        <span className="text-sm">{label}</span>
      </div>

      {/* Proportional (non-tabular) figures for a big standalone number — see
       * the project's data-visualization guidelines: tabular-nums makes large
       * numbers look artificially spaced out, and is only needed where digits
       * must align in a column (like the tariff table). */}
      <div className="text-3xl font-semibold" style={{ color: "var(--chart-text-primary)" }}>
        {value}
      </div>

      {delta && (
        <div
          className="mt-1 text-sm font-medium"
          style={{ color: delta.tone === "good" ? "var(--chart-success)" : "var(--chart-text-secondary)" }}
        >
          {delta.text}
        </div>
      )}

      {caption && (
        <div className="mt-1 text-xs" style={{ color: "var(--chart-muted)" }}>
          {caption}
        </div>
      )}
    </div>
  );
}
