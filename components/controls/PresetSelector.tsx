// -----------------------------------------------------------------------------
// components/controls/PresetSelector.tsx
//
// Buttons for the three ready-made scenarios defined in lib/presets.ts. This
// component doesn't know anything about what's IN a preset — it just lists
// whatever lib/presets.ts exports and calls the store's applyPreset() action
// when one is clicked. Adding a fourth preset later only requires editing
// lib/presets.ts, not this file.
// -----------------------------------------------------------------------------
"use client";

import { Sparkles } from "lucide-react";
import { PRESETS } from "@/lib/presets";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";

export function PresetSelector() {
  const activePresetId = useSimulationStore((state) => state.activePresetId);
  const applyPreset = useSimulationStore((state) => state.applyPreset);

  return (
    <ControlSection
      title="Starting Point"
      icon={Sparkles}
      description="Jump to a ready-made scenario, then fine-tune any slider below."
    >
      <div className="flex flex-col gap-2">
        {PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              aria-pressed={isActive}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-slate-200 text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-200"
              }`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="mt-0.5 text-xs text-slate-400">{preset.description}</div>
            </button>
          );
        })}
        {activePresetId === "custom" && (
          <p className="text-xs text-slate-400">
            Custom configuration — no preset currently matches your slider settings.
          </p>
        )}
      </div>
    </ControlSection>
  );
}
