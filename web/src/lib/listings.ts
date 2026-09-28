import { publicUrl } from "./url";

export type Airing = {
  start: string;
  show: string;
  episode: string;
};

export type StationListings = {
  week: number | null;
  fetchedAt: string;
  dates: string[];
  games: Record<string, Airing[]>;
  sites?: Record<string, string>;
};

const WEEK_KEY = "cf_listings_week_";

let loaded: Promise<StationListings | null> | null = null;

export function loadListings(): Promise<StationListings | null> {
  if (!loaded) {
    loaded = fetch(publicUrl("data/listings.json"))
      .then((response) => (response.ok ? (response.json() as Promise<StationListings>) : null))
      .catch(() => null)
      .then((data) => {
        if (data) rememberListings(data);
        return data;
      });
  }
  return loaded;
}

export function rememberListings(data: StationListings): void {
  if (data.week == null) return;
  try {
    localStorage.setItem(`${WEEK_KEY}${data.week}`, JSON.stringify(data));
  } catch {
    /* A full store should not block the schedule. */
  }
}

export function listingsForWeek(week: number): StationListings | null {
  try {
    const raw = localStorage.getItem(`${WEEK_KEY}${week}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as StationListings;
    return data.week === week ? data : null;
  } catch {
    return null;
  }
}

export function airingMatches(episode: string, awayName: string, homeName: string): boolean {
  const text = normalize(episode);
  const away = normalize(awayName);
  const home = normalize(homeName);
  if (!text || !away || !home) return false;
  return text.includes(away) && text.includes(home);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
