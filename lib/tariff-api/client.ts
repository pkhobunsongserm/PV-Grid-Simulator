// -----------------------------------------------------------------------------
// lib/tariff-api/client.ts
//
// Talks to the AER's public plan data (Consumer Data Right "Product Reference
// Data"). No API key is needed, and the server allows calls straight from the
// browser (it sends `Access-Control-Allow-Origin: *`), so this app doesn't need
// a backend of its own.
//
// Two calls, which need DIFFERENT `x-v` (API version) headers:
//   - plan LIST   → x-v: 1   (all of one retailer's plans; ~1-5 MB for big ones)
//   - plan DETAIL → x-v: 3   (the actual prices for one plan; x-v: 1 is rejected)
//
// Results are cached in memory for the life of the page, so re-picking a
// retailer or plan doesn't re-download it. Failed requests are NOT cached.
//
// Requests deliberately take no AbortSignal: the in-flight promise is shared
// through the cache, so one caller cancelling would break every other caller
// waiting on it (React dev mode does exactly that — mounts, cleans up, and
// mounts again). Callers that no longer care about a result just ignore it.
// -----------------------------------------------------------------------------

import { AER_BASE_URI } from "./brands";
import type { PlanDetail, PlanSummary } from "./types";

export class TariffApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "http" | "parse",
    public readonly status?: number
  ) {
    super(message);
    this.name = "TariffApiError";
  }
}

// 1000 is the API's maximum page size. Fewer, bigger pages = fewer round trips.
const PAGE_SIZE = 1000;
const LIST_VERSION = "1";
const DETAIL_VERSION = "3";

interface RequestOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

async function getJson(url: string, version: string, opts: RequestOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, { headers: { "x-v": version } });
  } catch {
    throw new TariffApiError("Couldn't reach the AER plan data. Check your connection.", "network");
  }
  if (!response.ok) {
    throw new TariffApiError(
      `The AER plan data returned an error (HTTP ${response.status}).`,
      "http",
      response.status
    );
  }
  try {
    return await response.json();
  } catch {
    throw new TariffApiError("The AER plan data wasn't in the expected format.", "parse");
  }
}

// ---- Plan list ----

const listCache = new Map<string, Promise<PlanSummary[]>>();

/**
 * All current RESIDENTIAL electricity plans for one retailer. Follows
 * pagination, and trims each plan down to just the fields the picker needs —
 * the raw list is dominated by long postcode arrays.
 */
export function fetchPlanList(brandId: string, opts: RequestOptions = {}): Promise<PlanSummary[]> {
  const cached = listCache.get(brandId);
  if (cached) return cached;

  const request = loadPlanList(brandId, opts).catch((err) => {
    listCache.delete(brandId);
    throw err;
  });
  listCache.set(brandId, request);
  return request;
}

/** Just the fields of a plan-list entry that we read. */
interface RawListedPlan {
  planId: string;
  displayName: string;
  customerType?: string;
  geography?: {
    distributors?: string[];
    includedPostcodes?: string[];
    excludedPostcodes?: string[];
  };
}

async function loadPlanList(brandId: string, opts: RequestOptions): Promise<PlanSummary[]> {
  const plans: PlanSummary[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url =
      `${AER_BASE_URI}/${encodeURIComponent(brandId)}/cds-au/v1/energy/plans` +
      `?type=ALL&fuelType=ELECTRICITY&effective=CURRENT&page=${page}&page-size=${PAGE_SIZE}`;
    const body = (await getJson(url, LIST_VERSION, opts)) as {
      data?: { plans?: unknown[] };
      meta?: { totalPages?: number };
    };
    if (!body?.data || !Array.isArray(body.data.plans)) {
      throw new TariffApiError("The AER plan data wasn't in the expected format.", "parse");
    }

    for (const raw of body.data.plans as RawListedPlan[]) {
      if (raw.customerType !== "RESIDENTIAL") continue;
      plans.push({
        planId: raw.planId,
        displayName: raw.displayName,
        distributors: raw.geography?.distributors ?? [],
        includedPostcodes: raw.geography?.includedPostcodes,
        excludedPostcodes: raw.geography?.excludedPostcodes,
      });
    }

    totalPages = body.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return plans;
}

// ---- Plan detail ----

const detailCache = new Map<string, Promise<PlanDetail>>();

/** The full pricing for a single plan. */
export function fetchPlanDetail(
  brandId: string,
  planId: string,
  opts: RequestOptions = {}
): Promise<PlanDetail> {
  const key = `${brandId}/${planId}`;
  const cached = detailCache.get(key);
  if (cached) return cached;

  const request = loadPlanDetail(brandId, planId, opts).catch((err) => {
    detailCache.delete(key);
    throw err;
  });
  detailCache.set(key, request);
  return request;
}

async function loadPlanDetail(
  brandId: string,
  planId: string,
  opts: RequestOptions
): Promise<PlanDetail> {
  // Plan IDs can contain "@" (e.g. "AGD790850MS@VEC"), hence the encoding.
  const url =
    `${AER_BASE_URI}/${encodeURIComponent(brandId)}/cds-au/v1/energy/plans/` +
    encodeURIComponent(planId);
  const body = (await getJson(url, DETAIL_VERSION, opts)) as { data?: PlanDetail };
  if (!body?.data?.electricityContract) {
    throw new TariffApiError("That plan has no electricity pricing data.", "parse");
  }
  return body.data;
}

/** Clears both caches. Only used by tests. */
export function clearTariffApiCache(): void {
  listCache.clear();
  detailCache.clear();
}
