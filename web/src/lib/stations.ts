import type { Place } from "../types";
import { publicUrl } from "./url";

export type Station = {
  callsign: string;
  network: string;
  channel: string;
  city: string;
};

export type MarketRecord = {
  zip: string;
  market: string;
  fetchedAt: string;
  stations: Station[];
};

type TvMarket = {
  id: number;
  name: string;
  state: string;
  pop: number;
  lat: number;
  lon: number;
  stations: Station[];
};

let loaded: Promise<TvMarket[]> | null = null;

export function loadMarkets(): Promise<TvMarket[]> {
  if (!loaded) {
    loaded = fetch(publicUrl("data/markets.json"))
      .then((response) => {
        if (!response.ok) throw new Error("Station list failed to load");
        return response.json() as Promise<TvMarket[]>;
      });
  }
  return loaded;
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Prefer the biggest TV market nearby, so a suburb doesn't land in a translator town. */
export function marketFor(place: Place, markets: TvMarket[]): MarketRecord | null {
  const ranked = markets
    .map((market) => ({ market, miles: milesBetween(place.lat, place.lon, market.lat, market.lon) }))
    .filter((item) => item.miles <= 100)
    .sort((a, b) => b.market.pop - a.market.pop || a.miles - b.miles);
  const chosen = ranked[0]?.market;
  if (!chosen) return null;
  return {
    zip: place.zip,
    market: chosen.state ? `${chosen.name}, ${chosen.state}` : chosen.name,
    fetchedAt: "",
    stations: chosen.stations,
  };
}

const NETWORKS = ["FOX", "CBS", "NBC", "ABC", "PBS", "CW", "ION"];

export function stationFor(networkLabel: string, stations: Station[]): Station | null {
  const upper = networkLabel.toUpperCase();
  const network = NETWORKS.find((name) => upper === name || upper.includes(name));
  if (!network) return null;
  return stations.find((station) => station.network === network) ?? null;
}

export function callsignFor(networkLabel: string, stations: Station[]): string | null {
  const station = stationFor(networkLabel, stations);
  return station ? `${station.callsign} ${station.channel}` : null;
}

export const MAJOR_NETWORKS = ["FOX", "CBS", "NBC", "ABC"] as const;
