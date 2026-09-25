import type { Place } from "../types";

export type Station = {
  callsign: string;
  network: string;
  channel: string;
};

export type MarketRecord = {
  zip: string;
  market: string;
  fetchedAt: string;
  stations: Station[];
};

type CatalogMarket = {
  name: string;
  lat: number | null;
  lon: number | null;
  stations: Station[];
};

type StateCatalog = {
  state: string;
  fetchedAt: string;
  markets: CatalogMarket[];
};

const CATALOG_KEY = "cf.catalog.v1";
const ZIP_KEY = "cf.zipmarkets.v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const WIKI = "https://en.wikipedia.org/w/api.php";

const NETWORKS: [string, RegExp][] = [
  ["FOX", /^fox$/i],
  ["CBS", /^cbs$/i],
  ["NBC", /^nbc$/i],
  ["ABC", /^abc$/i],
  ["PBS", /^pbs$/i],
  ["CW", /^(the cw|cw)$/i],
  ["ION", /^ion( television)?$/i],
];

const PAGE_STATE: Record<string, string> = {
  "District of Columbia": "Washington, D.C.",
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fresh(fetchedAt: string): boolean {
  return Date.now() - Date.parse(fetchedAt) < MAX_AGE_MS;
}

function shortCall(callsign: string): string {
  return callsign.replace(/-(TV|DT|LD|CD)$/i, "");
}

function stripWiki(value: string): string {
  return value
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(label: string): string | null {
  const text = label.trim();
  for (const [name, pattern] of NETWORKS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

function stationsFromAffiliation(callsign: string, channel: string, affiliation: string): Station[] {
  const clean = stripWiki(affiliation);
  const found: Station[] = [];
  const seen = new Set<string>();
  const add = (network: string | null, onChannel: string) => {
    if (!network || seen.has(network)) return;
    seen.add(network);
    found.push({ callsign, network, channel: onChannel });
  };

  const primary = clean.split(",")[0]?.trim() ?? "";
  add(canonical(primary), channel);

  for (const match of clean.matchAll(/\b(Fox|CBS|NBC|ABC|PBS|The CW|CW|Ion(?: Television)?)\s+on\s+(\d+(?:\.\d+)?)/gi)) {
    add(canonical(match[1]), match[2]);
  }
  return found;
}

export function parseStationList(wikitext: string): CatalogMarket[] {
  const markets: CatalogMarket[] = [];
  let current: CatalogMarket | null = null;

  for (const chunk of wikitext.split(/\n\|-/)) {
    const stationAt = chunk.search(/scope="row"/i);
    const head = stationAt >= 0 ? chunk.slice(0, stationAt) : "";
    const marketLink = head.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
    if (marketLink) {
      const raw = (marketLink[2] || marketLink[1]).replace(/^~/, "").trim();
      current = { name: raw, lat: null, lon: null, stations: [] };
      markets.push(current);
    }
    if (!current) continue;

    const station = chunk.match(/scope="row"[^|\n]*\|\s*\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/i);
    if (!station) continue;
    const after = chunk.slice((station.index ?? 0) + station[0].length);
    const cells = after.split("||").map((cell) => cell.trim());
    const channel = stripWiki(cells[0] ?? "").replace(/^\|/, "").trim();
    const affiliation = cells[1] ?? "";
    if (!channel || !/^\d/.test(channel)) continue;
    const callsign = shortCall(stripWiki(station[2] || station[1]));
    current.stations.push(...stationsFromAffiliation(callsign, channel, affiliation));
  }

  return markets.filter((market) => market.stations.length > 0);
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function wiki<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ ...params, format: "json", origin: "*" });
  const response = await fetch(`${WIKI}?${query}`, { signal });
  if (!response.ok) throw new Error("Wikipedia lookup failed");
  return (await response.json()) as T;
}

async function pageTitle(stateName: string, signal?: AbortSignal): Promise<string | null> {
  const titled = PAGE_STATE[stateName] ?? stateName;
  const guess = `List of television stations in ${titled}`;
  const data = await wiki<{ query?: { pages?: Record<string, { missing?: string; title?: string }> } }>(
    { action: "query", titles: guess, redirects: "1" },
    signal,
  );
  const page = Object.values(data.query?.pages ?? {})[0];
  if (page && !("missing" in page) && page.title) return page.title;

  const search = await wiki<{ query?: { search?: { title: string }[] } }>(
    { action: "query", list: "search", srsearch: guess, srlimit: "5" },
    signal,
  );
  return search.query?.search?.find((hit) => hit.title.startsWith("List of television stations in"))?.title ?? null;
}

async function fetchCatalog(stateName: string, signal?: AbortSignal): Promise<StateCatalog | null> {
  const stored = readJson<Record<string, StateCatalog>>(CATALOG_KEY) ?? {};
  const cached = stored[stateName];
  if (cached && fresh(cached.fetchedAt) && cached.markets.length > 0) return cached;

  const title = await pageTitle(stateName, signal);
  if (!title) return null;
  const parsed = await wiki<{ parse?: { wikitext?: { "*"?: string } } }>(
    { action: "parse", page: title, prop: "wikitext", redirects: "1" },
    signal,
  );
  const text = parsed.parse?.wikitext?.["*"];
  if (!text) return null;
  const markets = parseStationList(text);
  if (markets.length === 0) return null;
  await attachCoordinates(markets, stateName, signal);

  const catalog: StateCatalog = { state: stateName, fetchedAt: new Date().toISOString(), markets };
  stored[stateName] = catalog;
  writeJson(CATALOG_KEY, stored);
  return catalog;
}

async function attachCoordinates(markets: CatalogMarket[], stateName: string, signal?: AbortSignal) {
  const titles = markets.map((market) => (market.name.includes(",") ? market.name : `${market.name}, ${stateName}`));
  const data = await wiki<{ query?: { pages?: Record<string, { title?: string; coordinates?: { lat: number; lon: number }[] }> } }>(
    { action: "query", prop: "coordinates", titles: titles.join("|"), colimit: "50", redirects: "1" },
    signal,
  );
  const pages = Object.values(data.query?.pages ?? {});
  for (const market of markets) {
    const wanted = (market.name.includes(",") ? market.name : `${market.name}, ${stateName}`).toLowerCase();
    const page = pages.find((item) => item.title?.toLowerCase() === wanted) ?? pages.find((item) => item.title?.toLowerCase().startsWith(market.name.toLowerCase()));
    const point = page?.coordinates?.[0];
    if (point) {
      market.lat = point.lat;
      market.lon = point.lon;
    }
  }
}

function chooseMarket(catalog: StateCatalog, place: Place): CatalogMarket | null {
  let best: CatalogMarket | null = null;
  let bestMiles = Infinity;
  for (const market of catalog.markets) {
    if (market.lat == null || market.lon == null) continue;
    const distance = milesBetween(place.lat, place.lon, market.lat, market.lon);
    if (distance < bestMiles) {
      best = market;
      bestMiles = distance;
    }
  }
  if (!best || bestMiles > 220) {
    const named = catalog.markets.find((market) => market.name.toLowerCase() === place.city.toLowerCase());
    return named ?? best;
  }
  return best;
}

export function cachedMarket(zip: string): MarketRecord | null {
  const hit = (readJson<Record<string, MarketRecord>>(ZIP_KEY) ?? {})[zip];
  if (hit && fresh(hit.fetchedAt) && hit.stations.length > 0) return hit;
  return null;
}

export async function lookupStations(place: Place, signal?: AbortSignal): Promise<MarketRecord | null> {
  const hit = cachedMarket(place.zip);
  if (hit) return hit;

  const catalog = await fetchCatalog(place.stateName, signal);
  if (!catalog) return null;
  const market = chooseMarket(catalog, place);
  if (!market) return null;
  const record: MarketRecord = {
    zip: place.zip,
    market: market.name,
    fetchedAt: new Date().toISOString(),
    stations: market.stations,
  };
  const next = readJson<Record<string, MarketRecord>>(ZIP_KEY) ?? {};
  next[place.zip] = record;
  writeJson(ZIP_KEY, next);
  return record;
}

export function callsignFor(networkLabel: string, stations: Station[]): string | null {
  const upper = networkLabel.toUpperCase();
  const network = NETWORKS.find(([name]) => upper === name || upper.includes(name))?.[0];
  if (!network) return null;
  const hits = stations.filter((station) => station.network === network);
  const main = hits.find((station) => !station.channel.includes("."));
  return (main ?? hits[0])?.callsign ?? null;
}

export const MAJOR_NETWORKS = ["FOX", "CBS", "NBC", "ABC"] as const;
