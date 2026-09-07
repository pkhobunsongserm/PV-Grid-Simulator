// -----------------------------------------------------------------------------
// components/common/InfoLink.tsx
//
// A small inline link that jumps to one entry in the "Assumptions &
// Methodology" panel at the bottom of the page (see
// components/results/AssumptionsPanel.tsx) — used wherever a slider or result
// depends on a simplifying assumption that isn't obvious from the number or
// control alone.
//
// Deliberately a plain <a href="#assumption-...">, not a custom tooltip or
// popover: every modern browser already auto-expands a closed <details>
// element and scrolls to it when the URL fragment targets something inside
// it, so this needs no shared state to "open the panel from anywhere else on
// the page" — normal browser navigation does that for free, and it degrades
// gracefully even where that native behavior isn't supported (the link still
// jumps to the section; the reader just clicks it open themselves).
// -----------------------------------------------------------------------------

import type { Assumption } from "@/lib/assumptions";

export function InfoLink({ id, label = "Why?" }: { id: Assumption["id"]; label?: string }) {
  return (
    <a
      href={`#assumption-${id}`}
      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
      style={{ color: "inherit" }}
    >
      {label}
    </a>
  );
}
