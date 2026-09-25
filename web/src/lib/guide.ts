import { annotationLabel, fuzzyMatch } from "./match";
import type { Bucket, Coverage, CoverageGame, Listing, Side } from "../types";
import type { EspnGame } from "./espn";

const NETWORK_LABEL: Record<string, string> = {
  FOX: "FOX",
  CBS: "CBS",
  NBC: "NBC",
  ABC: "ABC",
  ESPN: "ESPN",
  PRIME: "Prime Video",
  NFLN: "NFL Network",
  NETFLIX: "Netflix",
  PEACOCK: "Peacock",
};

export function displayNetwork(code: string): string {
  return NETWORK_LABEL[code] ?? code;
}

function flags(networks: string[]) {
  const upper = networks.map((name) => name.toUpperCase());
  const has = (pattern: RegExp) => upper.some((name) => pattern.test(name));
  return {
    fox: has(/\bFOX\b/),
    cbs: has(/\bCBS\b/),
    nbc: has(/\bNBC\b/),
    abc: has(/\bABC\b/),
    streaming: has(/PRIME|AMAZON|NETFLIX|PEACOCK|PARAMOUNT/),
    cable: has(/\bESPN\b|NFL\s*NETWORK|\bNFLN\b/),
  };
}

function bucketFor(networks: string[], inLocal: boolean, mapsApply: boolean): Bucket {
  const kind = flags(networks);
  if (kind.fox || kind.cbs) {
    if (!mapsApply) return "unplaced";
    return inLocal ? "local" : "elsewhere";
  }
  if (kind.nbc || kind.abc) return "local";
  if (kind.streaming || kind.cable || inLocal) return "national";
  return mapsApply ? "elsewhere" : "unplaced";
}

function localLabels(coverage: Coverage, samples: Record<string, number | null> | null): string[] {
  if (!samples) return [];
  const labels: string[] = [];
  for (const game of coverage.games) {
    if (!isOnLocalMap(game, coverage, samples)) continue;
    labels.push(game.matchup);
    if (game.away && game.home) labels.push(`${game.away} at ${game.home}`);
    labels.push(game.rawMatchup);
  }
  return labels;
}

function isOnLocalMap(
  game: CoverageGame,
  coverage: Coverage,
  samples: Record<string, number | null>,
): boolean {
  if (game.national) return true;
  for (const map of coverage.maps) {
    const swatch = samples[`${map.network}|${map.slot}`];
    if (swatch == null) continue;
    if (game.network !== map.network || game.swatch !== swatch) continue;
    if (map.slot !== "SINGLE" && game.slot !== map.slot && game.slot !== "SINGLE") continue;
    return true;
  }
  return false;
}

function findCoverage(label: string, coverage: Coverage | null): CoverageGame | undefined {
  if (!coverage) return undefined;
  return coverage.games.find(
    (game) => fuzzyMatch(label, game.matchup) || fuzzyMatch(label, game.rawMatchup) || fuzzyMatch(label, `${game.away} at ${game.home}`),
  );
}

function blankSide(name: string): Side {
  return { abbr: "", name, short: name, score: "", winner: false };
}

function splitMatchup(matchup: string): { away: string; home: string; neutral: boolean } {
  const versus = matchup.split(/\s+vs\.?\s+/i);
  if (versus.length === 2) return { away: versus[0].trim(), home: versus[1].trim(), neutral: true };
  const at = matchup.split(/\s+@\s+|\s+at\s+/i);
  if (at.length === 2) return { away: at[0].trim(), home: at[1].trim(), neutral: false };
  return { away: matchup, home: "", neutral: false };
}

function followedSide(away: Side, home: Side, team: string): boolean {
  if (!team) return false;
  return away.abbr === team || home.abbr === team;
}

export function buildListings(options: {
  espn: EspnGame[];
  coverage: Coverage | null;
  samples: Record<string, number | null> | null;
  mapsApply: boolean;
  team: string;
}): Listing[] {
  const { espn, coverage, samples, mapsApply, team } = options;
  const locals = coverage && samples ? localLabels(coverage, samples) : [];
  const listings: Listing[] = espn.map((game) => {
    const label = `${game.away.name} at ${game.home.name}`;
    const inLocal = locals.some((entry) => fuzzyMatch(label, entry) || fuzzyMatch(game.label, entry));
    const match = findCoverage(game.label, coverage) ?? findCoverage(label, coverage);
    const networks = game.networks.length ? game.networks : match ? [displayNetwork(match.network)] : [];
    return {
      id: game.id,
      kickoff: game.kickoff,
      away: game.away,
      home: game.home,
      networks,
      announcers: match?.announcers ?? "",
      annotation: annotationLabel(match?.annotation ?? ""),
      neutral: game.neutral,
      state: game.state,
      detail: game.detail,
      bucket: bucketFor(networks, inLocal, mapsApply),
      followed: followedSide(game.away, game.home, team),
    };
  });

  if (coverage) {
    for (const game of coverage.games) {
      const already = listings.some(
        (listing) =>
          fuzzyMatch(`${listing.away.name} at ${listing.home.name}`, game.matchup) ||
          fuzzyMatch(game.matchup, `${listing.away.short} at ${listing.home.short}`),
      );
      if (already) continue;
      const parts = splitMatchup(game.matchup);
      const networks = [displayNetwork(game.network)];
      const inLocal = samples ? isOnLocalMap(game, coverage, samples) : false;
      const away = blankSide(game.away || parts.away);
      const home = blankSide(game.home || parts.home);
      listings.push({
        id: `map-${game.network}-${game.swatch}-${game.matchup}`,
        kickoff: game.kickoff,
        away,
        home,
        networks,
        announcers: game.announcers,
        annotation: annotationLabel(game.annotation),
        neutral: parts.neutral,
        state: "pre",
        detail: "",
        bucket: bucketFor(networks, inLocal, mapsApply),
        followed: followedSide(away, home, team),
      });
    }
  }

  return listings.sort((a, b) => {
    const at = a.kickoff ? Date.parse(a.kickoff) : Number.POSITIVE_INFINITY;
    const bt = b.kickoff ? Date.parse(b.kickoff) : Number.POSITIVE_INFINITY;
    return at - bt;
  });
}
