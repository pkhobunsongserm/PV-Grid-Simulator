// -----------------------------------------------------------------------------
// lib/tariff-api/brands.ts
//
// The retailers a user can pick from. The AER's plan data is published one
// retailer ("brand") at a time — there's no single national endpoint — so we
// need a list of brands to offer.
//
// Each `id` is the retailer's "CDR code": it's the path segment in
//   https://cdr.energymadeeasy.gov.au/{id}/cds-au/v1/energy/plans
// This list is deliberately curated rather than fetched: it only includes
// retailers that were confirmed (September 2026) to return electricity plans
// anonymously from that host. Some retailers (e.g. Simply Energy, Click,
// Mojo, PowerDirect) returned no plans there and are left out on purpose, so
// the picker never offers a dead end.
// -----------------------------------------------------------------------------

export interface RetailerBrand {
  id: string;
  name: string;
}

export const AER_BASE_URI = "https://cdr.energymadeeasy.gov.au";

export const RETAILER_BRANDS: RetailerBrand[] = [
  { id: "actewagl", name: "ActewAGL" },
  { id: "agl", name: "AGL" },
  { id: "alinta", name: "Alinta Energy" },
  { id: "amber", name: "Amber Electric" },
  { id: "arcline", name: "Arcline by RACV" },
  { id: "aurora", name: "Aurora Energy" },
  { id: "covau", name: "CovaU" },
  { id: "diamond", name: "Diamond Energy" },
  { id: "dodo", name: "Dodo" },
  { id: "energyaustralia", name: "EnergyAustralia" },
  { id: "engie", name: "ENGIE" },
  { id: "ergon", name: "Ergon Energy" },
  { id: "1st-energy", name: "1st Energy" },
  { id: "flow-power", name: "Flow Power" },
  { id: "globird", name: "Globird Energy" },
  { id: "kogan", name: "Kogan Energy" },
  { id: "lumo", name: "Lumo Energy" },
  { id: "momentum", name: "Momentum Energy" },
  { id: "nectr", name: "Nectr" },
  { id: "origin", name: "Origin Energy" },
  { id: "ovo-energy", name: "OVO Energy" },
  { id: "powershop", name: "Powershop" },
  { id: "red-energy", name: "Red Energy" },
  { id: "sumo-power", name: "Sumo" },
  { id: "tango", name: "Tango Energy" },
];

export function findBrand(id: string): RetailerBrand | undefined {
  return RETAILER_BRANDS.find((b) => b.id === id);
}
