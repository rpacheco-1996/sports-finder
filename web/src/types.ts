export type SportId = "nfl" | "ncaaf" | "mlb" | "nba" | "wnba" | "nhl";

export type Sport = {
  id: SportId;
  label: string;
  path: string;
  schedule: "week" | "day";
};

export const SPORTS: Sport[] = [
  { id: "nfl", label: "NFL", path: "football/nfl", schedule: "week" },
  { id: "ncaaf", label: "College football", path: "football/college-football", schedule: "week" },
  { id: "mlb", label: "MLB", path: "baseball/mlb", schedule: "day" },
  { id: "nba", label: "NBA", path: "basketball/nba", schedule: "day" },
  { id: "wnba", label: "WNBA", path: "basketball/wnba", schedule: "day" },
  { id: "nhl", label: "NHL", path: "hockey/nhl", schedule: "day" },
];

export function sportById(id: string): Sport {
  return SPORTS.find((sport) => sport.id === id) ?? SPORTS[0];
}

export type Bucket = "local" | "national" | "elsewhere" | "unplaced";

export type Side = {
  abbr: string;
  name: string;
  short: string;
  logo: string;
  score: string;
  winner: boolean;
};

export type Listing = {
  id: string;
  kickoff: string | null;
  away: Side;
  home: Side;
  networks: string[];
  announcers: string;
  annotation: string;
  neutral: boolean;
  state: "pre" | "in" | "post";
  detail: string;
  bucket: Bucket;
  followed: boolean;
  sourceUrl: string;
};

export type Place = {
  zip: string;
  city: string;
  state: string;
  stateName: string;
  lat: number;
  lon: number;
  timeZone: string;
};
