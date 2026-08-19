// -----------------------------------------------------------------------------
// components/controls/ToggleField.tsx
//
// A single reusable "yes/no" checkbox with a label and optional help text —
// currently used for "does this household own an EV?" in EVControls.tsx. A
// plain native <input type="checkbox"> rather than a custom-styled switch, on
// purpose: it matches this app's other controls (HourSelect's plain <select>,
// SliderField's plain <input type="range">), and gets keyboard/screen-reader
// support for free instead of having to rebuild it.
// -----------------------------------------------------------------------------
"use client";

import { useId } from "react";

interface ToggleFieldProps {
  /** The text label shown next to the checkbox, e.g. "This household owns an EV". */
  label: string;
  /** Whether the toggle is currently on. */
  checked: boolean;
  /** Called with the new value whenever the user clicks the checkbox. */
  onChange: (checked: boolean) => void;
  /** Optional small explanatory line shown below the toggle. */
  helpText?: string;
}

export function ToggleField({ label, checked, onChange, helpText }: ToggleFieldProps) {
  // Same useId()-based label/input linking as HourSelect.tsx — lets a screen
  // reader announce the label when the checkbox gets focus, rather than
  // treating the two as unrelated text and a form control.
  const inputId = useId();

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="flex cursor-pointer items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
        />
      </label>
      {helpText && <p className="mt-1 text-xs leading-snug text-slate-400">{helpText}</p>}
    </div>
  );
}
