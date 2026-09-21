// -----------------------------------------------------------------------------
// components/controls/PlanSelector.tsx
//
// Lets the user price the simulation against a REAL electricity plan instead of
// the built-in Melbourne tariff: pick a retailer, enter a postcode, pick a
// plan. Plans come live from the AER's public plan data (see
// lib/tariff-api/). The chosen plan is converted to an hourly tariff and put
// in the store (`tariff`), which the simulation hooks read — so every card,
// chart and the sensitivity matrix update to match.
//
// Failures (offline, retailer down, a plan we can't model) show a message and
// leave the previous tariff in place — the simulation never breaks because a
// network request did.
// -----------------------------------------------------------------------------
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlugZap } from "lucide-react";
import { useSimulationStore } from "@/store/useSimulationStore";
import { ControlSection } from "@/components/layout/ControlSection";
import { InfoLink } from "@/components/common/InfoLink";
import { RETAILER_BRANDS } from "@/lib/tariff-api/brands";
import { fetchPlanDetail, fetchPlanList, TariffApiError } from "@/lib/tariff-api/client";
import { isValidPostcode, plansForPostcode } from "@/lib/tariff-api/filter";
import { planToTariffSchedule, UnsupportedPlanError } from "@/lib/tariff-api/to-schedule";
import type { PlanSummary } from "@/lib/tariff-api/types";

type ListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; plans: PlanSummary[] }
  | { status: "error"; message: string };

function describeError(err: unknown): string {
  if (err instanceof TariffApiError || err instanceof UnsupportedPlanError) return err.message;
  return "Something went wrong loading that plan.";
}

const SELECT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
const LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

export function PlanSelector() {
  const tariff = useSimulationStore((state) => state.tariff);
  const planSelection = useSimulationStore((state) => state.planSelection);
  const setTariff = useSimulationStore((state) => state.setTariff);

  // What's typed/picked in this form. Starts from the store so it stays right if
  // a plan is already active when this component mounts.
  const [brandId, setBrandId] = useState(planSelection?.brandId ?? "");
  const [postcode, setPostcode] = useState(planSelection?.postcode ?? "");
  // The plan showing in the dropdown. Tracked separately from the store's active
  // plan so the dropdown doesn't snap back to the OLD plan while a new one loads.
  const [pickedPlanId, setPickedPlanId] = useState(planSelection?.planId ?? "");
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [planStatus, setPlanStatus] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string }
  >({ status: "idle" });

  // Load the retailer's plan list whenever the retailer changes. `cancelled`
  // makes a late response for a retailer the user has since left get ignored.
  useEffect(() => {
    if (!brandId) {
      setList({ status: "idle" });
      return;
    }
    let cancelled = false;
    setList({ status: "loading" });
    fetchPlanList(brandId)
      .then((plans) => {
        if (!cancelled) setList({ status: "ready", plans });
      })
      .catch((err) => {
        if (!cancelled) setList({ status: "error", message: describeError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const postcodeValid = isValidPostcode(postcode);
  const availablePlans = useMemo(
    () => (list.status === "ready" && postcodeValid ? plansForPostcode(list.plans, postcode) : []),
    [list, postcode, postcodeValid]
  );

  // Which plan the dropdown shows as chosen — only if it's still one of the
  // options (editing the postcode can remove it from the list).
  const selectedPlanId = availablePlans.some((p) => p.planId === pickedPlanId) ? pickedPlanId : "";

  // Bumped on every plan pick, so a slow earlier request that finishes after a
  // newer pick can tell it's stale and be ignored.
  const latestRequest = useRef(0);

  async function choosePlan(planId: string) {
    setPickedPlanId(planId);
    if (!planId) return;
    const thisRequest = ++latestRequest.current;
    setPlanStatus({ status: "loading" });
    try {
      const detail = await fetchPlanDetail(brandId, planId);
      const schedule = planToTariffSchedule(detail);
      if (latestRequest.current !== thisRequest) return;
      setTariff(schedule, { brandId, planId, postcode });
      setPlanStatus({ status: "idle" });
    } catch (err) {
      if (latestRequest.current !== thisRequest) return;
      setPlanStatus({ status: "error", message: describeError(err) });
    }
  }

  const notes = planSelection ? (tariff.tariff_info.notes ?? []) : [];

  return (
    <ControlSection
      title="Electricity Plan"
      icon={PlugZap}
      description={
        <>
          Price everything against a real retail plan from the AER&apos;s public plan data, or keep
          the built-in Melbourne tariff. <InfoLink id="tariff" />
        </>
      }
    >
      <div className="mb-3">
        <label htmlFor="plan-retailer" className={LABEL_CLASS}>
          Retailer
        </label>
        <select
          id="plan-retailer"
          value={brandId}
          onChange={(event) => {
            latestRequest.current += 1; // drop any plan pick still in flight
            setBrandId(event.target.value);
            setPickedPlanId("");
            setPlanStatus({ status: "idle" });
          }}
          className={SELECT_CLASS}
        >
          <option value="">Select a retailer…</option>
          {RETAILER_BRANDS.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label htmlFor="plan-postcode" className={LABEL_CLASS}>
          Postcode
        </label>
        <input
          id="plan-postcode"
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="e.g. 3000"
          value={postcode}
          // Digits only — anything else would just be a typo.
          onChange={(event) => setPostcode(event.target.value.replace(/\D/g, ""))}
          className={SELECT_CLASS}
        />
      </div>

      <div className="mb-3">
        <label htmlFor="plan-plan" className={LABEL_CLASS}>
          Plan
        </label>
        <select
          id="plan-plan"
          value={selectedPlanId}
          onChange={(event) => choosePlan(event.target.value)}
          disabled={
            list.status !== "ready" || !postcodeValid || availablePlans.length === 0
          }
          className={SELECT_CLASS}
        >
          <option value="">Select a plan…</option>
          {availablePlans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>
              {plan.displayName}
              {plan.distributors.length === 1 ? ` — ${plan.distributors[0]}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs leading-snug text-slate-400" aria-live="polite">
          {!brandId && "Choose a retailer to see its residential plans."}
          {brandId && list.status === "loading" && "Loading plans… (large retailers can take a few seconds)"}
          {list.status === "error" && list.message}
          {list.status === "ready" && !postcodeValid && "Enter your 4-digit postcode to see plans available there."}
          {list.status === "ready" && postcodeValid && availablePlans.length === 0 &&
            "No residential plans from this retailer for that postcode."}
          {list.status === "ready" && postcodeValid && availablePlans.length > 0 &&
            `${availablePlans.length} plan${availablePlans.length === 1 ? "" : "s"} available.`}
        </p>
        {planStatus.status === "loading" && (
          <p className="mt-1 text-xs text-slate-400" aria-live="polite">
            Loading plan prices…
          </p>
        )}
        {planStatus.status === "error" && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
            {planStatus.message} Your previous tariff is still in use.
          </p>
        )}
      </div>

      {planSelection && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <div className="font-medium">
            Using: {tariff.tariff_info.retailer} — {tariff.tariff_info.name}
          </div>
          {notes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-800 dark:text-emerald-200">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {planSelection && (
        <button
          type="button"
          onClick={() => {
            latestRequest.current += 1;
            setTariff();
            setPickedPlanId("");
            setPlanStatus({ status: "idle" });
          }}
          className="mt-2 text-xs font-medium text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-400"
        >
          Use the built-in Melbourne tariff instead
        </button>
      )}
    </ControlSection>
  );
}
