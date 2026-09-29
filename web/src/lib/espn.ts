import type { Station } from "./stations";
import { airingMatches, type Airing } from "./listings";
import { todayKey } from "./time";
import { sportById, type Side, type SportId } from "../types";

/**
 * Browser-safe scoreboard. `site.api.espn.com` answers 403 to page fetches.
 * `site.web.api.espn.com` is the same scoreboard and sends Access-Control-Allow-Origin: *.
 */
const SCOREBOARD_ROOT = "https://site.web.api.espn.com/apis/site/v2/sports";

const CACHE_PREFIX = "cf.espn.v2";
const LIVE_TTL_MS = 60 * 60 * 1000;
const PAST_TTL_MS = 24 * 60 * 60 * 1000;
const GENERIC_NETWORK = /^(tbd|tba|national|local|tv|network)?$/i;
const MARKET_RANK: Record<string, number> = { national: 0, home: 1, away: 2 };

export type Scoreboard = {
  games: EspnGame[];
  week: number | null;
  year: number | null;
};

export type EspnGame = {
  id: string;
  name: string;
  kickoff: string;
  neutral: boolean;
  networks: string[];
  state: "pre" | "in" | "post";
  detail: string;
  away: Side;
  home: Side;
  label: string;
};

export type LocalAffiliate = {
  network: string;
  callsign: string | null;
  sourceUrl: string;
};

type EspnTeam = {
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
};

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  winner?: boolean;
  team?: EspnTeam;
};

type EspnBroadcast = {
  market?: string;
  names?: string[];
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  competitions?: Array<{
    neutralSite?: boolean;
    competitors?: EspnCompetitor[];
    broadcasts?: EspnBroadcast[];
    status?: {
      period?: number;
      displayClock?: string;
      type?: { state?: string; shortDetail?: string };
    };
  }>;
};

type ScoreboardOptions = {
  week?: number | null;
  year?: number | null;
  day?: string | null;
  refresh?: boolean;
};

type CacheEntry = {
  savedAt: number;
  ttl: number;
  board: Scoreboard;
};

export function isGenericNetwork(name: string): boolean {
  return GENERIC_NETWORK.test(name.trim());
}

function sideFrom(competitor: EspnCompetitor | undefined, state: "pre" | "in" | "post"): Side {
  const team = competitor?.team ?? {};
  const score = state === "pre" ? "" : String(competitor?.score ?? "");
  return {
    abbr: team.abbreviation ?? "",
    name: team.displayName ?? "",
    short: team.shortDisplayName || team.abbreviation || "",
    score,
    winner: Boolean(competitor?.winner),
  };
}

function networkNames(broadcasts: EspnBroadcast[]): string[] {
  const ordered = [...broadcasts].sort(
    (a, b) => (MARKET_RANK[a.market ?? ""] ?? 3) - (MARKET_RANK[b.market ?? ""] ?? 3),
  );
  const names: string[] = [];
  for (const broadcast of ordered) {
    for (const name of broadcast.names ?? []) {
      const trimmed = name.trim();
      if (!trimmed || names.includes(trimmed)) continue;
      names.push(trimmed);
    }
  }
  return names;
}

function parseEvent(event: EspnEvent): EspnGame | null {
  const comp = event.competitions?.[0];
  if (!comp || !event.date) return null;
  const statusState = comp.status?.type?.state;
  const state: "pre" | "in" | "post" = statusState === "in" || statusState === "post" ? statusState : "pre";
  let detail = "";
  if (state === "in") {
    detail = comp.status?.type?.shortDetail || `Q${comp.status?.period ?? ""} ${comp.status?.displayClock ?? ""}`.trim();
  } else if (state === "post") {
    detail = comp.status?.type?.shortDetail || "Final";
  }
  const awayC = comp.competitors?.find((c) => c.homeAway === "away");
  const homeC = comp.competitors?.find((c) => c.homeAway === "home");
  const away = sideFrom(awayC, state);
  const home = sideFrom(homeC, state);
  if (state === "post") {
    const awayScore = Number(away.score);
    const homeScore = Number(home.score);
    if (Number.isFinite(awayScore) && Number.isFinite(homeScore) && awayScore !== homeScore) {
      away.winner = awayScore > homeScore;
      home.winner = homeScore > awayScore;
    }
  }
  const name = event.name || `${away.name} at ${home.name}`;
  return {
    id: event.id || `${event.date}-${away.abbr}-${home.abbr}`,
    name,
    kickoff: event.date,
    neutral: Boolean(comp.neutralSite),
    networks: networkNames(comp.broadcasts ?? []),
    state,
    detail,
    away,
    home,
    label: name,
  };
}

function cacheKey(sportId: SportId, options: ScoreboardOptions): string {
  const sport = sportById(sportId);
  if (sport.schedule === "week") return `${CACHE_PREFIX}|${sportId}|week:${options.week ?? "current"}`;
  return `${CACHE_PREFIX}|${sportId}|day:${options.day || "today"}`;
}

function readCache(key: string, allowExpired: boolean): Scoreboard | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.board || typeof entry.savedAt !== "number") return null;
    if (!allowExpired && Date.now() - entry.savedAt > entry.ttl) return null;
    return entry.board;
  } catch {
    return null;
  }
}

function writeCache(key: string, board: Scoreboard, day: string | null): void {
  const now = Date.now();
  const pastDay = Boolean(day && day < todayKey());
  const stillLive = board.games.some((game) => game.state !== "post" || Date.parse(game.kickoff) > now);
  const ttl = pastDay || !stillLive ? PAST_TTL_MS : LIVE_TTL_MS;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: now, ttl, board } satisfies CacheEntry));
  } catch {
    /* Private mode or a full store should not break the schedule. */
  }
}

export async function loadScoreboard(
  sportId: SportId,
  options: ScoreboardOptions,
  signal?: AbortSignal,
): Promise<Scoreboard> {
  const key = cacheKey(sportId, options);
  if (!options.refresh) {
    const cached = readCache(key, false);
    if (cached) return cached;
  }
  try {
    const board = await fetchScoreboard(sportId, options, signal);
    if (!signal?.aborted) writeCache(key, board, options.day ?? null);
    return board;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const stale = options.refresh ? null : readCache(key, true);
    if (stale) return stale;
    throw error;
  }
}

async function fetchScoreboard(
  sportId: SportId,
  options: ScoreboardOptions,
  signal?: AbortSignal,
): Promise<Scoreboard> {
  const sport = sportById(sportId);
  const params = new URLSearchParams();
  if (sport.schedule === "week") {
    params.set("seasontype", "2");
    if (options.week) params.set("week", String(options.week));
    if (options.year) params.set("dates", String(options.year));
  } else if (options.day) {
    params.set("dates", options.day.replaceAll("-", ""));
  }
  const query = params.toString();
  const url = `${SCOREBOARD_ROOT}/${sport.path}/scoreboard${query ? `?${query}` : ""}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Schedule failed to load");
  const data = (await response.json()) as {
    week?: { number?: number };
    season?: { year?: number };
    events?: EspnEvent[];
  };
  return {
    games: (data.events ?? []).map(parseEvent).filter((game): game is EspnGame => game !== null),
    week: data.week?.number ?? null,
    year: data.season?.year ?? null,
  };
}

const REGIONAL = ["FOX", "CBS", "NBC", "ABC"] as const;

/** When ESPN has no usable network, look the game up on the local station guide. */
export function mapLocalAffiliate(
  game: Pick<EspnGame, "away" | "home">,
  network: string,
  context: {
    stations: Station[];
    airings: Record<string, Airing[]>;
    sites: Record<string, string>;
  },
): LocalAffiliate | null {
  const requested = network.toUpperCase();
  const targets = isGenericNetwork(network)
    ? REGIONAL
    : REGIONAL.filter((name) => requested === name || requested.includes(name));
  for (const name of targets) {
    const station = context.stations.find((item) => item.network === name);
    if (!station) continue;
    const key = `${station.callsign}|${name}`;
    const rows = context.airings[key];
    if (!rows?.some((row) => matches(row.episode, game))) continue;
    return {
      network: name,
      callsign: `${station.callsign} ${station.channel}`,
      sourceUrl: context.sites[key] ?? "",
    };
  }
  return null;
}

function matches(episode: string, game: Pick<EspnGame, "away" | "home">): boolean {
  return (
    airingMatches(episode, game.away.short, game.home.short) ||
    airingMatches(episode, game.away.name, game.home.name)
  );
}
