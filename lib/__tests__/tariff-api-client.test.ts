// -----------------------------------------------------------------------------
// lib/__tests__/tariff-api-client.test.ts
//
// Checks the AER plan-data client (lib/tariff-api/client.ts) against a fake
// `fetch`, so no real network calls are made: the right URL and `x-v` version
// header per call type, pagination, residential-only trimming, caching, and
// error mapping.
// -----------------------------------------------------------------------------

import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  clearTariffApiCache,
  fetchPlanDetail,
  fetchPlanList,
  TariffApiError,
} from "@/lib/tariff-api/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const listedPlan = (planId: string, customerType = "RESIDENTIAL") => ({
  planId,
  displayName: `Plan ${planId}`,
  customerType,
  geography: { distributors: ["Net"], includedPostcodes: ["3000"] },
});

beforeEach(() => clearTariffApiCache());

describe("fetchPlanList", () => {
  test("requests version 1, follows pagination, and keeps only residential plans", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: { plans: [listedPlan("a"), listedPlan("biz", "BUSINESS")] },
          meta: { totalPages: 2 },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { plans: [listedPlan("c")] }, meta: { totalPages: 2 } })
      );

    const plans = await fetchPlanList("agl", { fetchImpl });

    expect(plans.map((p) => p.planId)).toEqual(["a", "c"]);
    expect(plans[0]).toEqual({
      planId: "a",
      displayName: "Plan a",
      distributors: ["Net"],
      includedPostcodes: ["3000"],
      excludedPostcodes: undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0];
    expect(firstUrl).toContain("https://cdr.energymadeeasy.gov.au/agl/cds-au/v1/energy/plans?");
    expect(firstUrl).toContain("page=1");
    expect(fetchImpl.mock.calls[1][0]).toContain("page=2");
    expect(firstInit.headers["x-v"]).toBe("1");
  });

  test("caches a successful list, so the second call makes no request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { plans: [listedPlan("a")] }, meta: { totalPages: 1 } }));

    await fetchPlanList("agl", { fetchImpl });
    await fetchPlanList("agl", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("HTTP errors become TariffApiError and are NOT cached", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ data: { plans: [] }, meta: { totalPages: 1 } }));

    await expect(fetchPlanList("agl", { fetchImpl })).rejects.toMatchObject({
      name: "TariffApiError",
      kind: "http",
      status: 500,
    });
    // A retry goes back to the network rather than replaying the failure.
    await expect(fetchPlanList("agl", { fetchImpl })).resolves.toEqual([]);
  });

  test("a network failure becomes a TariffApiError of kind 'network'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchPlanList("agl", { fetchImpl })).rejects.toMatchObject({ kind: "network" });
  });

  test("an unexpected body shape is reported as a parse error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    const err = await fetchPlanList("agl", { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(TariffApiError);
    expect(err.kind).toBe("parse");
  });
});

describe("fetchPlanDetail", () => {
  test("requests version 3 and URL-encodes the plan id", async () => {
    const detail = { planId: "AGD1@VEC", electricityContract: { tariffPeriod: [] } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: detail }));

    const result = await fetchPlanDetail("agl", "AGD1@VEC", { fetchImpl });

    expect(result).toEqual(detail);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://cdr.energymadeeasy.gov.au/agl/cds-au/v1/energy/plans/AGD1%40VEC");
    expect(init.headers["x-v"]).toBe("3");
  });

  test("a response without electricity pricing is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { planId: "x" } }));
    await expect(fetchPlanDetail("agl", "x", { fetchImpl })).rejects.toMatchObject({ kind: "parse" });
  });
});
