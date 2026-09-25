import { sportById, type Side, type SportId } from "../types";

export type Scoreboard = {
  games: EspnGame[];
  week: number | null;
  year: number | null;
};

export type EspnGame = {
  id: string;
  kickoff: string;
  neutral: boolean;
  networks: string[];
  state: "pre" | "in" | "post";
  detail: string;
  away: Side;
  home: Side;
  label: string;
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

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  competitions?: Array<{
    neutralSite?: boolean;
    competitors?: EspnCompetitor[];
    broadcasts?: Array<{ names?: string[] }>;
    status?: {
      period?: number;
      displayClock?: string;
      type?: { state?: string; shortDetail?: string };
    };
  }>;
};

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
  const networks: string[] = [];
  for (const broadcast of comp.broadcasts ?? []) {
    for (const name of broadcast.names ?? []) {
      if (name && !networks.includes(name)) networks.push(name);
    }
  }
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
  return {
    id: event.id || `${event.date}-${away.abbr}-${home.abbr}`,
    kickoff: event.date,
    neutral: Boolean(comp.neutralSite),
    networks,
    state,
    detail,
    away,
    home,
    label: event.name || `${away.name} at ${home.name}`,
  };
}

export async function loadScoreboard(
  sportId: SportId,
  options: { week?: number | null; year?: number | null; day?: string | null },
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
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${sport.path}/scoreboard${query ? `?${query}` : ""}`;
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
