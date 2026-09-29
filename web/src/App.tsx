import { type FormEvent, useState } from "react";
import { site } from "./config";
import { TEAMS } from "./data/teams";
import { PlaceSearch } from "./components/PlaceSearch";
import { Results, Skeleton } from "./components/Results";
import { loadPlaces, placeByZip } from "./lib/places";
import { MAJOR_NETWORKS, callsignFor } from "./lib/stations";
import { useGuide } from "./lib/useGuide";
import { gameSlug } from "./lib/seo";
import { formatWhen } from "./lib/time";
import type { Listing } from "./types";

const EXAMPLES = [
  { zip: "83702", label: "Boise" },
  { zip: "51360", label: "Spirit Lake" },
];

function regionalNet(networks: string[]): string {
  const upper = networks.map((name) => name.toUpperCase());
  if (upper.some((name) => name.includes("FOX"))) return "FOX";
  if (upper.some((name) => name.includes("CBS"))) return "CBS";
  return "";
}

function teamLine(games: Listing[], teamName: string, timeZone: string, city: string, localReady: boolean): string {
  const game = games.find((item) => item.followed);
  const name = `The ${teamName}`;
  if (!game) return `${name} have no game on this slate.`;
  const when = formatWhen(game.kickoff, timeZone);
  const on = game.networks.join(" / ") || "a network to be announced";
  const whenText = game.kickoff ? `${when.dayLabel} at ${when.timeLabel}` : "at a time to be announced";
  if (game.bucket === "elsewhere") {
    const code = regionalNet(game.networks);
    const alt = games
      .filter((item) => item.bucket === "local" && item.id !== game.id && regionalNet(item.networks) === code)
      .sort((a, b) => Math.abs(Date.parse(a.kickoff ?? "") - Date.parse(game.kickoff ?? "")) - Math.abs(Date.parse(b.kickoff ?? "") - Date.parse(game.kickoff ?? "")))[0];
    const instead = alt
      ? ` ${city}’s ${code} game is ${alt.away.short} at ${alt.home.short}, ${formatWhen(alt.kickoff, timeZone).timeLabel}.`
      : "";
    return `${name} play ${whenText} on ${on}, in other markets.${instead}`;
  }
  if (game.bucket === "local" && city) return `${name} play ${whenText} on ${on}. It’s on in ${city}.`;
  if (game.bucket === "national") return `${name} play ${whenText} on ${on}.`;
  if (!localReady && (regionalNet(game.networks) === "FOX" || regionalNet(game.networks) === "CBS")) {
    return `${name} play ${whenText} on ${on}. Pick a city to see if that game is on the local station.`;
  }
  return `${name} play ${whenText} on ${on}.`;
}

export function App() {
  const guide = useGuide();
  const [copied, setCopied] = useState(false);
  const timeZone = guide.place?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = guide.place?.city ?? "";

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  const showLocalTab = guide.sport.id === "nfl" && guide.localReady;
  const note = marketNote(guide);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="brand-name">{site.name}</p>
            <p className="brand-tag">{site.tagline}</p>
          </div>
        </div>
        <button className="ghost" type="button" onClick={() => void onCopy()}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </header>

      <section className="hero">
        <h1>Find Your Game&apos;s TV Channel Instantly</h1>
        <p>No fluff, no ads, no 10-paragraph articles. Just live TV networks and streaming options for NFL, NBA, MLB, NHL, &amp; WNBA.</p>
      </section>

      <form className="finder" onSubmit={onSubmit}>
        <div className="finder-grid">
          <PlaceSearch selectedLabel={guide.place ? guide.zipInput : ""} onSelect={guide.selectPlace} />
          <label className="field">
            <span>Sport</span>
            <select
              value={guide.sport.id}
              onChange={(event) => guide.setSportId(event.target.value as typeof guide.sport.id)}
            >
              {guide.sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.label}
                </option>
              ))}
            </select>
          </label>
          {guide.sport.id === "nfl" && (
            <label className="field">
              <span>Follow a team</span>
              <select value={guide.team} onChange={(event) => guide.setTeam(event.target.value)}>
                <option value="">No team</option>
                {TEAMS.map((team) => (
                  <option key={team.abbr} value={team.abbr}>
                    {team.city} {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {guide.zipError && <p className="field-error" role="alert">{guide.zipError}</p>}
        {guide.place && (
          <div className="place-block">
            <p className="place-line">
              <strong>{guide.place.city}, {guide.place.stateName}</strong>
              <span>{guide.place.zip}</span>
            </p>
            <StationLine market={guide.market} status={guide.stationsStatus} />
          </div>
        )}
        {!guide.place && !guide.zipError && (
          <div className="examples">
            <span>Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.zip}
                type="button"
                onClick={() => {
                  void loadPlaces().then((places) => {
                    const found = placeByZip(places, example.zip);
                    if (found) guide.selectPlace(found);
                  });
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
        )}
      </form>

      {guide.followed && !guide.scheduleLoading && (
        <p className="banner">
          {teamLine(guide.listings, guide.followed.name, timeZone, city, guide.localReady)}
        </p>
      )}

      <div className="results-head">
        <div className="period">
          <button type="button" className="step" onClick={() => guide.step(-1)} disabled={!guide.canPrev} aria-label="Previous">
            ‹
          </button>
          <div>
            <h2>{guide.periodLabel}</h2>
            {guide.periodDetail && <p>{guide.periodDetail}</p>}
          </div>
          <button type="button" className="step" onClick={() => guide.step(1)} disabled={!guide.canNext} aria-label="Next">
            ›
          </button>
        </div>
        {showLocalTab && (
          <div className="tabs" role="tablist" aria-label="Which games">
            <button type="button" role="tab" aria-selected={guide.view === "local"} className={guide.view === "local" ? "is-on" : ""} onClick={() => guide.setView("local")}>
              In {city}
            </button>
            <button type="button" role="tab" aria-selected={guide.view === "all"} className={guide.view === "all" ? "is-on" : ""} onClick={() => guide.setView("all")}>
              All games
            </button>
          </div>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => guide.refreshSchedule()}
          disabled={guide.scheduleLoading}
        >
          {guide.scheduleLoading ? "Refreshing…" : "Refresh schedule"}
        </button>
      </div>

      {note && <p className="note">{note}</p>}
      <p className="tz-note">Times in {city ? city : "your time zone"}.</p>

      {guide.scheduleError && <p className="field-error" role="alert">{guide.scheduleError}</p>}
      {guide.scheduleLoading ? (
        <Skeleton />
      ) : (
        <Results
          games={showLocalTab ? guide.visible : guide.listings}
          view={showLocalTab ? guide.view : "all"}
          timeZone={timeZone}
          city={city}
          checking={guide.checking}
          localReady={guide.localReady}
          stations={guide.market?.stations ?? []}
          selectedSlug={guide.selectedGame ? gameSlug(guide.selectedGame) : ""}
          onSelect={guide.selectGame}
        />
      )}

      <footer>
        <p>
          A time on a local game links to that station’s website so you can confirm it.
          Listings come from the station’s own guide when it publishes one.
          Call signs and channel numbers come from <a href="https://www.rabbitears.info/">RabbitEars</a>.
          City and zip locations come from GeoNames. Times come from ESPN. Confirm the game in your provider’s guide.
        </p>
        {site.supportUrl && (
          <a className="support" href={site.supportUrl}>
            {site.supportLabel}
          </a>
        )}
      </footer>
    </div>
  );
}

function StationLine({
  market,
  status,
}: {
  market: ReturnType<typeof useGuide>["market"];
  status: ReturnType<typeof useGuide>["stationsStatus"];
}) {
  if (status === "loading") return <p className="stations">Looking up local stations…</p>;
  if (!market) return null;
  const lineup = MAJOR_NETWORKS.flatMap((network) => {
    const callsign = callsignFor(network, market.stations);
    return callsign ? [`${callsign} ${network}`] : [];
  });
  return (
    <p className="stations">
      <span>{market.market}</span>
      {lineup.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </p>
  );
}

function marketNote(guide: ReturnType<typeof useGuide>): string {
  const city = guide.place?.city;
  if (guide.sport.id !== "nfl") {
    return "Station schedules on this page cover NFL games. This list shows the network each game is on.";
  }
  if (guide.checking && city) return `Reading the station schedules for ${city}…`;
  if (guide.localReady) return "";
  if (guide.listingsStatus === "missing") return "Station schedules aren’t published on this page yet, so local FOX and CBS games are unmarked.";
  if (guide.onListedWeek && !guide.place) return "Enter a city or zip to see which games are on the local stations.";
  if (guide.listedWeek && !guide.onListedWeek) {
    return "Local station maps are optimized for the current NFL week.";
  }
  return "";
}
