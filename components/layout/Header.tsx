// -----------------------------------------------------------------------------
// components/layout/Header.tsx
//
// The page's top banner — just the app name and a one-line description. Split
// out into its own component (rather than inlined in app/page.tsx) purely for
// readability: app/page.tsx stays focused on overall page layout, and this
// file stays focused on "what does the header look like".
// -----------------------------------------------------------------------------

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
        Antikythera: Resilience vs. ROI Microgrid Sensitivity Matrix and Dashboard
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        V2G Edition — a solar + battery + vehicle-to-grid what-if simulator for a Melbourne
        household
      </p>
    </header>
  );
}
