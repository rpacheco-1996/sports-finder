import type { Place } from "../types";
import tzlookup from "tz-lookup";

const CACHE_KEY = "cf.places.v1";

type ZippoPlace = {
  "place name": string;
  longitude: string;
  latitude: string;
  state: string;
  "state abbreviation": string;
};

function readCache(): Record<string, Place> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Place>) : {};
  } catch {
    return {};
  }
}

function writeCache(zip: string, place: Place) {
  const cache = readCache();
  cache[zip] = place;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function normalizeZip(value: string): string | null {
  const match = value.trim().match(/\d{5}/);
  return match ? match[0] : null;
}

export async function lookupZip(zip: string, signal?: AbortSignal): Promise<Place | null> {
  const cached = readCache()[zip];
  if (cached) return cached;

  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Zip lookup failed");
  const data = (await response.json()) as { places?: ZippoPlace[] };
  const hit = data.places?.[0];
  if (!hit) return null;

  const lat = Number(hit.latitude);
  const lon = Number(hit.longitude);
  let timeZone = "America/New_York";
  try {
    timeZone = tzlookup(lat, lon);
  } catch {
    timeZone = "America/New_York";
  }

  const place: Place = {
    zip,
    city: hit["place name"],
    state: hit["state abbreviation"],
    stateName: hit.state,
    lat,
    lon,
    timeZone,
  };
  writeCache(zip, place);
  return place;
}
