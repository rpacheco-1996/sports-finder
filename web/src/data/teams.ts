export type Team = {
  abbr: string;
  city: string;
  name: string;
};

export const TEAMS: Team[] = [
  { abbr: "ARI", city: "Arizona", name: "Cardinals" },
  { abbr: "ATL", city: "Atlanta", name: "Falcons" },
  { abbr: "BAL", city: "Baltimore", name: "Ravens" },
  { abbr: "BUF", city: "Buffalo", name: "Bills" },
  { abbr: "CAR", city: "Carolina", name: "Panthers" },
  { abbr: "CHI", city: "Chicago", name: "Bears" },
  { abbr: "CIN", city: "Cincinnati", name: "Bengals" },
  { abbr: "CLE", city: "Cleveland", name: "Browns" },
  { abbr: "DAL", city: "Dallas", name: "Cowboys" },
  { abbr: "DEN", city: "Denver", name: "Broncos" },
  { abbr: "DET", city: "Detroit", name: "Lions" },
  { abbr: "GB", city: "Green Bay", name: "Packers" },
  { abbr: "HOU", city: "Houston", name: "Texans" },
  { abbr: "IND", city: "Indianapolis", name: "Colts" },
  { abbr: "JAX", city: "Jacksonville", name: "Jaguars" },
  { abbr: "KC", city: "Kansas City", name: "Chiefs" },
  { abbr: "LV", city: "Las Vegas", name: "Raiders" },
  { abbr: "LAC", city: "Los Angeles", name: "Chargers" },
  { abbr: "LAR", city: "Los Angeles", name: "Rams" },
  { abbr: "MIA", city: "Miami", name: "Dolphins" },
  { abbr: "MIN", city: "Minnesota", name: "Vikings" },
  { abbr: "NE", city: "New England", name: "Patriots" },
  { abbr: "NO", city: "New Orleans", name: "Saints" },
  { abbr: "NYG", city: "New York", name: "Giants" },
  { abbr: "NYJ", city: "New York", name: "Jets" },
  { abbr: "PHI", city: "Philadelphia", name: "Eagles" },
  { abbr: "PIT", city: "Pittsburgh", name: "Steelers" },
  { abbr: "SF", city: "San Francisco", name: "49ers" },
  { abbr: "SEA", city: "Seattle", name: "Seahawks" },
  { abbr: "TB", city: "Tampa Bay", name: "Buccaneers" },
  { abbr: "TEN", city: "Tennessee", name: "Titans" },
  { abbr: "WSH", city: "Washington", name: "Commanders" },
];

export function teamByAbbr(abbr: string): Team | undefined {
  return TEAMS.find((team) => team.abbr === abbr);
}
