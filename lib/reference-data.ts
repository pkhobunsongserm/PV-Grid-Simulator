// -----------------------------------------------------------------------------
// lib/reference-data.ts
//
// The three JSON files in /data, imported once and labeled with their proper
// TypeScript types. Anywhere else in the app that needs the "real" tariff,
// solar, or household data (as opposed to a user's scaled version of it —
// see scaleReferenceData() in lib/v2g-simulation.ts) should import from here
// instead of importing the JSON files directly. That keeps the "trust me, this
// JSON matches this type" cast in exactly one place, instead of repeated in
// every file that needs the data.
// -----------------------------------------------------------------------------

import tariffJson from "@/data/tou_tariff.json";
import solarJson from "@/data/solar_profile.json";
import loadJson from "@/data/household_load.json";
import type { TariffSchedule, SolarProfileData, HouseholdLoadData } from "@/lib/types";

export const tariffSchedule = tariffJson as TariffSchedule;
export const referenceSolarProfile = solarJson as SolarProfileData;
export const referenceHouseholdLoad = loadJson as HouseholdLoadData;
