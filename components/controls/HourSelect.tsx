// -----------------------------------------------------------------------------
// components/controls/HourSelect.tsx
//
// A dropdown for picking one hour of the day (0-23), displayed as a familiar
// "6:00 PM" style label. Used for the EV's departure/arrival times and the
// blackout-start-hour control. The whole simulation engine works in whole
// hours (see README.md "Locked decisions" #11), so a free-form time picker
// (letting someone pick, say, 6:47 PM) would offer false precision the engine
// can't actually use — a plain hour dropdown is the honest choice here.
// -----------------------------------------------------------------------------
"use client";

import { useId } from "react";
import { formatHour } from "@/lib/format";

interface HourSelectProps {
  label: string;
  value: number; // 0-23
  onChange: (hour: number) => void;
  helpText?: string;
}

export function HourSelect({ label, value, onChange, helpText }: HourSelectProps) {
  // Build the list [0, 1, 2, ..., 23] once per render to populate the dropdown.
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  // useId() generates a unique id per rendered instance of this component
  // (React guarantees it won't collide with any other id on the page, even
  // when — as here — the same component is used 3 times: Departure Time,
  // Arrival Time, Blackout Start Time). Linking the <label> and <select> via
  // matching htmlFor/id is what lets a screen reader announce "Departure
  // Time" when this specific dropdown gets focus — a visible label sitting
  // next to a control isn't enough on its own; without this link, the two
  // are just unrelated text and a form control as far as assistive tech is
  // concerned.
  const selectId = useId();

  return (
    <div className="mb-4">
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        {hours.map((hour) => (
          <option key={hour} value={hour}>
            {formatHour(hour)}
          </option>
        ))}
      </select>
      {helpText && <p className="mt-1 text-xs leading-snug text-slate-400">{helpText}</p>}
    </div>
  );
}
