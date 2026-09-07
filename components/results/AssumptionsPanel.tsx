// -----------------------------------------------------------------------------
// components/results/AssumptionsPanel.tsx
//
// The single place a visitor can read every simplifying assumption behind the
// numbers on this page, in plain language — content lives in
// lib/assumptions.ts so this component and every InfoLink scattered through
// the sidebar/results reference the exact same wording, never a second copy
// that could drift out of sync.
//
// A native <details>/<summary> disclosure, not a hand-built accordion: it's
// keyboard- and screen-reader-accessible for free, and (as of recent Chrome/
// Firefox/Safari) the browser automatically opens a closed <details> and
// scrolls to it when a link elsewhere on the page targets an id inside it —
// exactly the "jump to the relevant assumption" behavior InfoLink wants,
// with zero shared state between components.
// -----------------------------------------------------------------------------

import { Info } from "lucide-react";
import { ASSUMPTIONS } from "@/lib/assumptions";

export function AssumptionsPanel() {
  return (
    <details
      id="assumptions"
      className="rounded-lg border p-4"
      style={{ backgroundColor: "var(--chart-surface)", borderColor: "var(--chart-border)" }}
    >
      <summary
        className="cursor-pointer text-sm font-semibold"
        style={{ color: "var(--chart-text-primary)" }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-4 w-4" aria-hidden="true" />
          Assumptions &amp; Methodology
        </span>
        <span className="ml-1 text-xs font-normal" style={{ color: "var(--chart-muted)" }}>
          — what every number on this page does and doesn&apos;t account for
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--chart-border)" }}>
        {ASSUMPTIONS.map((assumption) => (
          <div
            key={assumption.id}
            id={`assumption-${assumption.id}`}
            // scroll-mt so a jump-to-anchor doesn't land the heading flush
            // against the viewport edge.
            className="scroll-mt-4 text-xs leading-relaxed"
            style={{ color: "var(--chart-text-secondary)" }}
          >
            <p className="font-medium" style={{ color: "var(--chart-text-primary)" }}>
              {assumption.title}
            </p>
            <p>{assumption.detail}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
