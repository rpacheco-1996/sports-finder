import type { Place } from "../types";
import { publicUrl } from "./url";
import tzlookup from "tz-lookup";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

let loaded: Promise<Place[]> | null = null;

function toPlace(city: string, state: string, zip: string, lat: number, lon: number): Place {
  let timeZone = "America/New_York";
  try {
    timeZone = tzlookup(lat, lon);
  } catch {
    timeZone = "America/New_York";
  }
  return {
    city,
    state,
    stateName: STATE_NAMES[state] ?? state,
    zip,
    lat,
    lon,
    timeZone,
  };
}

export function placeLabel(place: Place): string {
  return `${place.city}, ${place.state} ${place.zip}`;
}

export function loadPlaces(): Promise<Place[]> {
  if (!loaded) {
    loaded = fetch(publicUrl("places.txt"))
      .then((response) => {
        if (!response.ok) throw new Error("Place list failed to load");
        return response.text();
      })
      .then((text) =>
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [city, state, zip, lat, lon] = line.split("\t");
            return toPlace(city, state, zip, Number(lat), Number(lon));
          }),
      );
  }
  return loaded;
}

function central(group: Place[]): Place {
  const lat = group.reduce((sum, place) => sum + place.lat, 0) / group.length;
  const lon = group.reduce((sum, place) => sum + place.lon, 0) / group.length;
  return group.reduce((best, place) => {
    const bestD = (best.lat - lat) ** 2 + (best.lon - lon) ** 2;
    const nextD = (place.lat - lat) ** 2 + (place.lon - lon) ** 2;
    return nextD < bestD ? place : best;
  });
}

export function searchPlaces(places: Place[], query: string): Place[] {
  const text = query.trim().toLowerCase();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  if (/^\d{2,5}$/.test(text)) {
    return places.filter((place) => place.zip.startsWith(digits)).slice(0, 8);
  }

  const [cityQuery, stateQuery = ""] = text.split(",").map((part) => part.trim());
  if (cityQuery.length < 2) return [];
  const groups = new Map<string, Place[]>();
  for (const place of places) {
    if (!place.city.toLowerCase().startsWith(cityQuery)) continue;
    if (stateQuery && !place.state.toLowerCase().startsWith(stateQuery) && !place.stateName.toLowerCase().startsWith(stateQuery)) {
      continue;
    }
    const key = `${place.city.toLowerCase()}|${place.state}`;
    const group = groups.get(key);
    if (group) group.push(place);
    else groups.set(key, [place]);
  }
  return [...groups.values()]
    .map(central)
    .sort((a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state))
    .slice(0, 8);
}

export function placeByZip(places: Place[], zip: string): Place | null {
  return places.find((place) => place.zip === zip) ?? null;
}
