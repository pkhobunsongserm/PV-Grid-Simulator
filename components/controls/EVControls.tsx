// -----------------------------------------------------------------------------
// components/controls/EVControls.tsx
//
// Every slider/dropdown related to the EV and its charger: whether it's
// bidirectional (V2G) at all, size, charger speed, discharge floor, starting
// charge, commute schedule, and daily commute energy use. See README.md
// "Locked decisions" #4 for why the EV Discharge Floor behaves differently
// from the Stationary Reserve SoC slider (in ReserveSocSlider.tsx) even
// though they look like similar kinds of controls, and #13 for the V2G
// on/off toggle.
// -----------------------------------------------------------------------------
"use client";

import { Car, TriangleAlert } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { InfoLink } from "@/components/common/InfoLink";
import { SliderField } from "./SliderField";
import { HourSelect } from "./HourSelect";
import { ToggleField } from "./ToggleField";
import { formatPercent } from "@/lib/format";

export function EVControls() {
  const ev = useSimulationStore((state) => state.inputs.ev);
  const setEV = useSimulationStore((state) => state.setEV);

  return (
    <ControlSection
      title="EV & V2G Configuration"
      icon={Car}
      description={
        <>
          Your electric vehicle and its charger — charges from solar first, then the grid (by
          default, waiting out the priciest hours first).{" "}
          <InfoLink id="no-grid-charging" />
        </>
      }
    >
      <ToggleField
        label="This household owns an EV"
        checked={ev.ownsEv}
        onChange={(ownsEv) => setEV({ ownsEv })}
        helpText="Turn off if there's no electric vehicle here — it's excluded from every calculation and chart. The settings below are kept as-is, so turning this back on restores them unchanged."
      />
      {ev.ownsEv && (
        <>
          <ToggleField
            label="Enable V2G (bidirectional charging)"
            checked={ev.v2gEnabled}
            onChange={(v2gEnabled) => setEV({ v2gEnabled })}
            helpText={
              <>
                On (default): the charger can push power back into the house during Evening
                Peak, and help out during a simulated blackout. Off: models a standard, cheaper
                unidirectional charger — the EV still charges completely normally, but never
                discharges, under any circumstance (including an outage) — a real one-way
                charger has no hardware to push power backward.{" "}
                <InfoLink id="ev-v2g-toggle" />
              </>
            }
          />
          <SliderField
            label="EV Battery Capacity"
            value={ev.capacityKwh}
            min={40}
            max={100}
            onChange={(capacityKwh) => setEV({ capacityKwh })}
            formatValue={(v) => `${v} kWh`}
          />
          <SliderField
            label={ev.v2gEnabled ? "V2G Charger Power" : "Charger Power"}
            value={ev.chargerPowerKw}
            min={3.3}
            max={11}
            step={0.1}
            onChange={(chargerPowerKw) => setEV({ chargerPowerKw })}
            formatValue={(v) => `${v.toFixed(1)} kW`}
            helpText={
              ev.v2gEnabled ? (
                <>
                  Caps how fast the EV can charge OR discharge — including grid-charging, so a
                  bigger number here can mean a bigger grid bill, not just a faster fill-up.{" "}
                  <InfoLink id="no-grid-charging" />
                </>
              ) : (
                <>
                  Caps how fast the EV can charge — including grid-charging, so a bigger number
                  here can mean a bigger grid bill, not just a faster fill-up. V2G is off, so
                  this charger only ever charges, never discharges.{" "}
                  <InfoLink id="no-grid-charging" />
                </>
              )
            }
          />
          <ToggleField
            label="Avoid peak-price grid charging"
            checked={ev.avoidPeakGridCharging}
            onChange={(avoidPeakGridCharging) => setEV({ avoidPeakGridCharging })}
            helpText={
              <>
                On (default): the EV still charges from the grid the moment solar can&apos;t keep
                up, but waits out Evening Peak (the day&apos;s most expensive rate) first, resuming
                the instant Off-Peak or Solar Sponge starts. Off: charges immediately regardless
                of price, even at Evening Peak rates. <InfoLink id="no-grid-charging" />
              </>
            }
          />
          <SliderField
            label="EV Discharge Floor"
            value={ev.dischargeFloorPct}
            min={20}
            max={50}
            onChange={(dischargeFloorPct) => setEV({ dischargeFloorPct })}
            formatValue={formatPercent}
            helpText={
              ev.v2gEnabled
                ? "The EV never discharges below this line — not even during a simulated blackout — to protect enough charge to actually drive somewhere."
                : "Has no effect right now — V2G is off, so this EV never discharges at all, in normal operation or during a blackout."
            }
          />
          <SliderField
            label="Starting Charge"
            value={ev.startingSocPct}
            min={0}
            max={100}
            onChange={(startingSocPct) => setEV({ startingSocPct })}
            formatValue={formatPercent}
            helpText={
              <>
                How full the EV is at the start of the simulated day — defaults to 80%
                (&ldquo;charged overnight&rdquo;). <InfoLink id="starting-soc" />
              </>
            }
          />
          <SliderField
            label="Max Charge Cap"
            value={ev.chargeCapPct}
            min={50}
            max={100}
            onChange={(chargeCapPct) => setEV({ chargeCapPct })}
            formatValue={formatPercent}
            helpText={
              <>
                The EV is never charged — from solar or the grid, any hour of the day — above
                this line, mirroring a real-world EV charge-limit setting for battery longevity.
                It doesn&apos;t pull the EV down if it&apos;s already above the cap (e.g. from a
                high Starting Charge value), it only stops further charging until that drops
                back under. <InfoLink id="ev-charge-cap" />
              </>
            }
          />
          <HourSelect
            label="Departure Time"
            value={ev.departureHour}
            onChange={(departureHour) => setEV({ departureHour })}
            helpText="When the EV leaves for its daily commute and becomes unavailable to the house."
          />
          <HourSelect
            label="Arrival Time"
            value={ev.arrivalHour}
            onChange={(arrivalHour) => setEV({ arrivalHour })}
            helpText={
              <>
                When the EV returns home and becomes available again — and starts charging back
                up right away, from solar then the grid (subject to the peak-pricing toggle
                below). <InfoLink id="no-grid-charging" />
              </>
            }
          />
          {/* A basic input-validation guard, not a hard block — Departure ==
           * Arrival is a legal value (isEvAway() in lib/v2g-simulation.ts
           * deliberately treats it as "EV never home," see README.md #5), but
           * it's very easy to land on by accident while dragging two separate
           * dropdowns, and the resulting behavior (EV never charges, never
           * discharges, never helps in a blackout) is easy to misread as a bug
           * rather than the direct consequence of this specific setting. */}
          {ev.departureHour === ev.arrivalHour && (
            <div
              className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              role="status"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Departure and Arrival are set to the same hour — the EV will be treated as
                never home, so it won&apos;t charge, discharge, or help during a blackout.
              </span>
            </div>
          )}
          <SliderField
            label="Daily Commute Energy"
            value={ev.dailyCommuteKwh}
            min={5}
            max={30}
            onChange={(dailyCommuteKwh) => setEV({ dailyCommuteKwh })}
            formatValue={(v) => `${v} kWh`}
            helpText="Deducted from the EV's charge once, at departure — a single round-trip total."
          />
        </>
      )}
    </ControlSection>
  );
}
