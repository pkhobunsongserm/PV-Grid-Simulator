// -----------------------------------------------------------------------------
// store/useSimulationStore.ts
//
// This is the ONE place in the app that holds the current slider/input values
// (what battery size is picked, what the EV's commute schedule is, etc). Every
// control component in components/controls/ reads from and writes to this
// store; every result component (charts, cards, the sensitivity table) reads
// the CALCULATED results derived from it, but never stores its own copy of the
// inputs. See README.md's "Key rule" under Project Structure for why that
// matters — it means there's only ever one place a slider value can live, so
// nothing can quietly drift out of sync.
//
// This uses Zustand, a small state-management library. If you haven't used it
// before: `create(...)` builds a "store" — an object holding some data (here,
// `inputs` and `activePresetId`) plus some functions that are allowed to change
// it (`setBattery`, `applyPreset`, etc). Any component can call
// `useSimulationStore(selector)` to read a piece of that data, and React will
// automatically re-render that component whenever the piece it selected
// changes — and, importantly, WON'T re-render it when some other, unrelated
// piece changes. That selective re-rendering is the whole reason this project
// uses Zustand instead of just React's built-in Context (see README.md's Tech
// Stack section for the full explanation).
// -----------------------------------------------------------------------------

import { create } from "zustand";
import { DEFAULT_SIMULATION_INPUTS } from "@/lib/constants";
import { PRESETS, buildPresetInputs } from "@/lib/presets";
import type {
  SimulationInputs,
  BatteryConfig,
  EVConfig,
  SolarConfig,
  LoadConfig,
  CapexConfig,
  PresetConfig,
} from "@/lib/types";

/** Every value + action this store exposes. `inputs` is the actual data;
 * everything else is a function that changes some part of it. */
interface SimulationStore {
  inputs: SimulationInputs;

  // Which preset (if any) the current inputs exactly match. Starts on
  // "commuter-ev" because DEFAULT_SIMULATION_INPUTS IS that preset (see
  // lib/presets.ts). Switches to "custom" the moment the user drags any single
  // slider away from a preset's values, so the UI can show "Custom" instead of
  // leaving a preset looking selected when it no longer matches.
  activePresetId: PresetConfig["id"] | "custom";

  // One setter per section of SimulationInputs. Each takes a "patch" — just the
  // fields you want to change — and merges it into that section, leaving
  // everything else untouched. E.g. setBattery({ capacityKwh: 15 }) only
  // changes the battery's capacity, not its reserve or starting charge.
  setBattery: (patch: Partial<BatteryConfig>) => void;
  setEV: (patch: Partial<EVConfig>) => void;
  setSolar: (patch: Partial<SolarConfig>) => void;
  setLoad: (patch: Partial<LoadConfig>) => void;
  setCapex: (patch: Partial<CapexConfig>) => void;
  setBlackoutStartHour: (hour: number) => void;

  /** Replaces the entire set of inputs with one of the three named presets from
   * lib/presets.ts (e.g. "Off-Grid Heavy"). */
  applyPreset: (presetId: PresetConfig["id"]) => void;

  /** Resets everything back to the app's out-of-the-box configuration. */
  resetToDefaults: () => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  inputs: DEFAULT_SIMULATION_INPUTS,
  activePresetId: "commuter-ev",

  // Each setter below follows the same pattern: read the current state,
  // build a brand-new `inputs` object (spreading `...state.inputs` to copy
  // every section, then overwriting just the one section that changed, itself
  // spread with the patch merged in), and hand that new object to `set(...)`.
  // Building a NEW object each time (rather than editing the old one in
  // place) is what lets React/Zustand cheaply detect "did anything change?" —
  // and it's also why useSimulationResult()'s useMemo (see hooks/) correctly
  // knows to recalculate whenever any of these run.
  setBattery: (patch) =>
    set((state) => ({
      inputs: { ...state.inputs, battery: { ...state.inputs.battery, ...patch } },
      activePresetId: "custom",
    })),

  setEV: (patch) =>
    set((state) => ({
      inputs: { ...state.inputs, ev: { ...state.inputs.ev, ...patch } },
      activePresetId: "custom",
    })),

  setSolar: (patch) =>
    set((state) => ({
      inputs: { ...state.inputs, solar: { ...state.inputs.solar, ...patch } },
      activePresetId: "custom",
    })),

  setLoad: (patch) =>
    set((state) => ({
      inputs: { ...state.inputs, load: { ...state.inputs.load, ...patch } },
      activePresetId: "custom",
    })),

  setCapex: (patch) =>
    set((state) => ({
      inputs: { ...state.inputs, capex: { ...state.inputs.capex, ...patch } },
      activePresetId: "custom",
    })),

  setBlackoutStartHour: (hour) =>
    set((state) => ({
      inputs: { ...state.inputs, blackoutStartHour: hour },
      activePresetId: "custom",
    })),

  applyPreset: (presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return; // unknown id — do nothing rather than crash
    set({ inputs: buildPresetInputs(preset), activePresetId: presetId });
  },

  resetToDefaults: () => set({ inputs: DEFAULT_SIMULATION_INPUTS, activePresetId: "commuter-ev" }),
}));
