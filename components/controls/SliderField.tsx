// -----------------------------------------------------------------------------
// components/controls/SliderField.tsx
//
// A single reusable "slider with a label and a live value" — every slider in
// the sidebar (battery capacity, reserve SoC, EV floor, solar capacity, etc.)
// renders through THIS one component instead of each one writing its own
// near-identical markup. If we ever want every slider in the app to look or
// behave slightly differently (e.g. add tick marks), this is the one file to
// change.
//
// "use client" at the top of a file tells Next.js "this code needs to run in
// the visitor's browser, not on the server" — required for anything that
// responds to user interaction (typing, dragging a slider, clicking a button),
// since a server has no browser to interact with. See README.md's glossary.
// -----------------------------------------------------------------------------
"use client";

interface SliderFieldProps {
  /** The text label shown above the slider, e.g. "Battery Capacity". */
  label: string;
  /** The slider's current value. */
  value: number;
  min: number;
  max: number;
  /** How much the value jumps per drag increment. Defaults to 1. */
  step?: number;
  /** Called with the new value every time the user moves the slider. */
  onChange: (value: number) => void;
  /** Optional custom formatting for the value shown next to the label, e.g.
   * turning `20` into `"20%"` or `18` into `"6:00 PM"`. If omitted, the raw
   * number is shown as-is. */
  formatValue?: (value: number) => string;
  /** Optional small explanatory line shown below the slider, for anything that
   * needs a bit more context than the label alone gives (e.g. clarifying that
   * Reserve SoC only applies during normal operation, not a blackout). */
  helpText?: string;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  helpText,
}: SliderFieldProps) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <span className="whitespace-nowrap text-sm tabular-nums text-slate-500 dark:text-slate-400">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        // The browser always hands onChange a text string (that's how HTML
        // inputs work), so Number(...) converts it back into an actual number
        // before we pass it up to whoever's listening.
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-emerald-600"
        aria-label={label}
      />
      {helpText && <p className="mt-1 text-xs leading-snug text-slate-400">{helpText}</p>}
    </div>
  );
}
