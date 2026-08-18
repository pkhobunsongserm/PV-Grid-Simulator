// -----------------------------------------------------------------------------
// app/page.tsx
//
// The app's one and only page. "use client" at the top means this whole
// component tree runs in the browser (see README.md's glossary on
// client-side) — there's nothing server-rendered here, since every number on
// screen depends on live slider state.
//
// As of Phase 6, every piece of the original feature spec's Visualization
// Dashboard exists: Executive Cards, the Dual-Battery chart, the Energy Flow
// Diagram, and the Sensitivity Matrix Table. Phase 7 (presets + polish) is
// UI refinement, not new components.
// -----------------------------------------------------------------------------
"use client";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ExecutiveSummaryCards } from "@/components/results/ExecutiveSummaryCards";
import { DualBatteryChart } from "@/components/results/DualBatteryChart";
import { EnergyFlowDiagram } from "@/components/results/EnergyFlowDiagram";
import { SensitivityMatrixTable } from "@/components/results/SensitivityMatrixTable";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 space-y-4 p-6">
          <ExecutiveSummaryCards />
          <DualBatteryChart />
          <EnergyFlowDiagram />
          <SensitivityMatrixTable />
        </main>
      </div>
    </div>
  );
}
