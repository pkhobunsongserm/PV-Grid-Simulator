// -----------------------------------------------------------------------------
// components/layout/ControlSection.tsx
//
// A shared "card" wrapper used to group a set of related sliders/inputs in the
// sidebar under a heading and icon (e.g. all the EV settings together, all the
// battery settings together). Lives in components/layout/ rather than
// components/controls/ because it doesn't represent any particular input value
// itself — it's purely a layout/grouping container that the real control
// components (BatteryControls, EVControls, etc.) render their sliders inside.
//
// Supports an optional collapsible mode (defaultOpen={false}) for sections that
// shouldn't be open by default, like the "Advanced: Cost Assumptions" panel —
// most users won't need to touch capex numbers, so hiding it by default keeps
// the sidebar from feeling overwhelming.
// -----------------------------------------------------------------------------
"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

interface ControlSectionProps {
  title: string;
  icon: LucideIcon;
  /** Short line shown under the title, explaining what this group of settings
   * controls. */
  description?: string;
  children: ReactNode;
  /** If provided, the section becomes collapsible/expandable, starting in this
   * open/closed state. If omitted, the section is always open (not
   * collapsible) — used for the primary, "you'll definitely want to see this"
   * sections. */
  defaultOpen?: boolean;
}

export function ControlSection({
  title,
  icon: Icon,
  description,
  children,
  defaultOpen,
}: ControlSectionProps) {
  const isCollapsible = defaultOpen !== undefined;
  const [isOpen, setIsOpen] = useState(defaultOpen ?? true);

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        // Only collapsible sections respond to clicks on the header — for
        // non-collapsible ones this is effectively just a styled heading.
        onClick={isCollapsible ? () => setIsOpen((open) => !open) : undefined}
        className={`flex w-full items-center justify-between text-left ${
          isCollapsible ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        </span>
        {isCollapsible && (
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {description && (
        <p className="mt-1 text-xs leading-snug text-slate-400">{description}</p>
      )}

      {isOpen && <div className="mt-3">{children}</div>}
    </section>
  );
}
