import type { Bucket, Listing } from "../types";
import { isGenericNetwork, mapLocalAffiliate, type EspnGame } from "./espn";
import { airingMatches, type Airing } from "./listings";
import type { Station } from "./stations";

const REGIONAL = ["FOX", "CBS", "NBC", "ABC"] as const;

function kindOf(networks: string[]) {
  const upper = networks.map((name) => name.toUpperCase());
  const has = (pattern: RegExp) => upper.some((name) => pattern.test(name));
  const regional = REGIONAL.find((name) => has(new RegExp(`\\b${name}\\b`)));
  return {
    regional: regional ?? "",
    streaming: has(/PRIME|AMAZON|NETFLIX|PEACOCK|PARAMOUNT/),
    cable: has(/\bESPN\b|NFL\s*NETWORK|\bNFLN\b/),
  };
}

function listed(airings: Airing[] | undefined, game: EspnGame): boolean {
  if (!airings) return false;
  return airings.some(
    (airing) =>
      airingMatches(airing.episode, game.away.short, game.home.short) ||
      airingMatches(airing.episode, game.away.name, game.home.name),
  );
}

function bucketFor(game: EspnGame, stations: Station[], airings: Record<string, Airing[]>, ready: boolean): Bucket {
  const kind = kindOf(game.networks);
  if (kind.regional === "FOX" || kind.regional === "CBS") {
    if (!ready) return "unplaced";
    const station = stations.find((item) => item.network === kind.regional);
    const rows = station ? airings[`${station.callsign}|${kind.regional}`] : undefined;
    if (!station || !rows) return "unplaced";
    return listed(rows, game) ? "local" : "elsewhere";
  }
  if (kind.regional === "NBC" || kind.regional === "ABC") {
    const station = stations.find((item) => item.network === kind.regional);
    const rows = station && ready ? airings[`${station.callsign}|${kind.regional}`] : undefined;
    if (rows) return listed(rows, game) ? "local" : "elsewhere";
    return "local";
  }
  if (kind.streaming || kind.cable) return "national";
  return ready ? "elsewhere" : "unplaced";
}

function followedSide(game: EspnGame, team: string): boolean {
  if (!team) return false;
  return game.away.abbr === team || game.home.abbr === team;
}

function resolvedGame(
  game: EspnGame,
  stations: Station[],
  airings: Record<string, Airing[]>,
  sites: Record<string, string>,
): EspnGame {
  const named = game.networks.filter((name) => !isGenericNetwork(name));
  if (named.length > 0) return { ...game, networks: named };
  const mapped = mapLocalAffiliate(game, "", { stations, airings, sites });
  return mapped ? { ...game, networks: [mapped.network] } : { ...game, networks: [] };
}
function stationKey(game: EspnGame, stations: Station[]): string {
  const regional = kindOf(game.networks).regional;
  if (!regional) return "";
  const station = stations.find((item) => item.network === regional);
  return station ? `${station.callsign}|${regional}` : "";
}

export function buildListings(options: {
  espn: EspnGame[];
  airings: Record<string, Airing[]>;
  sites: Record<string, string>;
  stations: Station[];
  localReady: boolean;
  team: string;
}): Listing[] {
  const { espn, airings, sites, stations, localReady, team } = options;
  return espn
    .map((game) => {
      const resolved = resolvedGame(game, stations, airings, sites);
      const bucket = bucketFor(resolved, stations, airings, localReady);
      const key = stationKey(resolved, stations);
      return {
        id: resolved.id,
        kickoff: resolved.kickoff,
        away: resolved.away,
        home: resolved.home,
        networks: resolved.networks,
        announcers: "",
        annotation: "",
        neutral: resolved.neutral,
        state: resolved.state,
        detail: resolved.detail,
        bucket,
        followed: followedSide(resolved, team),
        sourceUrl: bucket === "local" && key ? sites[key] ?? "" : "",
      };
    })
    .sort((a, b) => {
      const at = a.kickoff ? Date.parse(a.kickoff) : Number.POSITIVE_INFINITY;
      const bt = b.kickoff ? Date.parse(b.kickoff) : Number.POSITIVE_INFINITY;
      return at - bt;
    });
}
