const STOP = new Set([
  "at", "vs", "the", "a", "an", "in", "and", "or",
  "bay", "city", "lake", "los", "angeles", "new", "york",
  "green", "san", "st", "saint", "de", "la", "las",
]);

const REPLACEMENTS: [string, string][] = [
  ["los angeles rams", "rams"],
  ["los angeles chargers", "chargers"],
  ["la rams", "rams"],
  ["la chargers", "chargers"],
  ["new york jets", "jets"],
  ["new york giants", "giants"],
  ["ny jets", "jets"],
  ["ny giants", "giants"],
  ["san francisco", "49ers"],
  ["green bay", "packers"],
  ["tampa bay", "buccaneers"],
  ["kansas city", "chiefs"],
  ["new england", "patriots"],
  ["new orleans", "saints"],
  ["las vegas", "raiders"],
  ["sf", "49ers"],
  ["washington", "commanders"],
  ["wsh", "commanders"],
];

export function normMatchup(value: string): string {
  let text = value.toLowerCase();
  text = text.replace(/\(.*?\)/g, "");
  text = text.replace("@", " at ").replace(/ vs /g, " at ").replace(/ versus /g, " at ");
  text = text.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [from, to] of REPLACEMENTS) {
    text = text.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return text;
}

export function teamTokens(value: string): Set<string> {
  return new Set(
    normMatchup(value)
      .split(" ")
      .filter((token) => token.length > 2 && !STOP.has(token)),
  );
}

export function fuzzyMatch(left: string, right: string): boolean {
  const a = teamTokens(left);
  let shared = 0;
  for (const token of teamTokens(right)) {
    if (a.has(token)) shared += 1;
  }
  return shared >= 2;
}

export function annotationLabel(note: string): string {
  const clean = note.trim();
  if (!clean || /^(late|early)$/i.test(clean)) return "";
  return clean.replace(/^in\s+/i, "");
}
