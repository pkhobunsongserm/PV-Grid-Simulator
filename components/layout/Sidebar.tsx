// -----------------------------------------------------------------------------
// components/layout/Sidebar.tsx
//
// The left-hand panel holding every input control. This file doesn't contain
// any slider logic itself — it just decides WHICH controls appear and in WHAT
// ORDER, delegating the actual sliders to the individual components in
// components/controls/. Each of those reads from and writes to
// store/useSimulationStore.ts directly, so this file doesn't need to pass any
// data down to them itself.
// -----------------------------------------------------------------------------
"use client";

import { PresetSelector } from "@/components/controls/PresetSelector";
import { SolarControls } from "@/components/controls/SolarControls";
import { BatteryControls } from "@/components/controls/BatteryControls";
import { ReserveSocSlider } from "@/components/controls/ReserveSocSlider";
import { EVControls } from "@/components/controls/EVControls";
import { LoadControls } from "@/components/controls/LoadControls";
import { BlackoutStartControl } from "@/components/controls/BlackoutStartControl";
import { TariffDisplay } from "@/components/controls/TariffDisplay";
import { CapexControls } from "@/components/controls/CapexControls";

export function Sidebar() {
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 md:sticky md:top-0 md:h-screen md:w-96">
      <PresetSelector />
      <SolarControls />
      <BatteryControls />
      <ReserveSocSlider />
      <EVControls />
      <LoadControls />
      <BlackoutStartControl />
      <TariffDisplay />
      <CapexControls />
    </aside>
  );
}
