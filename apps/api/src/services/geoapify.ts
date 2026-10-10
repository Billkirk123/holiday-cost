import type { LocationSuggestion } from "@holiday-cost/shared";
import { config } from "../config.js";

export class GeoapifyNotConfiguredError extends Error {
  constructor() {
    super("Location suggestions are not configured yet. Add GEOAPIFY_API_KEY to apps/api/.env.");
    this.name = "GeoapifyNotConfiguredError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function locationSuggestionFromResult(value: unknown): LocationSuggestion | undefined {
  if (!isRecord(value)) return undefined;

  const providerPlaceId = typeof value.place_id === "string" ? value.place_id : "";
  const formatted = typeof value.formatted === "string" ? value.formatted : "";
  const city = typeof value.city === "string"
    ? value.city
    : typeof value.name === "string"
      ? value.name
      : "";
  const country = typeof value.country === "string" ? value.country : "";
  const countryCode = typeof value.country_code === "string"
    ? value.country_code.toUpperCase()
    : null;
  const latitude = value.lat;
  const longitude = value.lon;

  if (
    !providerPlaceId || !formatted || !city || !country ||
    providerPlaceId.length > 255 || formatted.length > 120 ||
    city.length > 120 || country.length > 120 ||
    (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) ||
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return undefined;
  }

  return {
    providerPlaceId,
    formatted,
    city,
    country,
    countryCode,
    latitude,
    longitude,
  };
}

export async function suggestLocations(query: string): Promise<LocationSuggestion[]> {
  if (!config.geoapifyApiKey) throw new GeoapifyNotConfiguredError();

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("type", "city");
  url.searchParams.set("limit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", config.geoapifyApiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Geoapify returned HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error("Geoapify returned an invalid suggestions response.");
  }

  return payload.results
    .map(locationSuggestionFromResult)
    .filter((suggestion): suggestion is LocationSuggestion => suggestion !== undefined);
}
