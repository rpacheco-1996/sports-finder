import type { Listing } from "../types";
import { gameSlug } from "../lib/seo";
import { callsignFor, type Station } from "../lib/stations";
import { formatWhen } from "../lib/time";

type Group = { key: string; label: string; games: Listing[] };

function groupByDay(games: Listing[], timeZone: string): Group[] {
  const groups: Group[] = [];
  for (const game of games) {
    const when = formatWhen(game.kickoff, timeZone);
    const last = groups[groups.length - 1];
    if (!last || last.key !== when.dayKey) groups.push({ key: when.dayKey, label: when.dayLabel, games: [game] });
    else last.games.push(game);
  }
  return groups;
}

function netSlug(name: string): string {
  const value = name.toUpperCase();
  if (value.includes("FOX")) return "fox";
  if (value.includes("CBS")) return "cbs";
  if (value.includes("NBC")) return "nbc";
  if (value.includes("ABC")) return "abc";
  if (value.includes("ESPN")) return "espn";
  if (value.includes("NFL")) return "nfl";
  if (value.includes("PRIME") || value.includes("AMAZON")) return "prime";
  if (value.includes("NETFLIX")) return "netflix";
  if (value.includes("PEACOCK")) return "peacock";
  return "other";
}

function GameRow({
  game,
  timeZone,
  city,
  showBadge,
  checking,
  stations,
  selected,
  onSelect,
}: {
  game: Listing;
  timeZone: string;
  city: string;
  showBadge: boolean;
  checking: boolean;
  stations: Station[];
  selected: boolean;
  onSelect: (game: Listing) => void;
}) {
  const when = formatWhen(game.kickoff, timeZone);
  const home = game.home.name || game.home.short;
  return (
    <article
      className={`game${game.followed ? " is-followed" : ""}${game.state === "in" ? " is-live" : ""}${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) return;
        onSelect(game);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(game);
      }}
    >
      <div className="when">
        {game.sourceUrl ? (
          <a className="clock" href={game.sourceUrl} target="_blank" rel="noreferrer">
            {when.timeLabel}
            <span className="sr-only">, open the station site to confirm</span>
          </a>
        ) : (
          <span className="clock">{when.timeLabel}</span>
        )}
        {game.state !== "pre" && <span className="status">{game.detail}</span>}
      </div>
      <div className="matchup">
        <p className="side">
          {game.away.logo ? <img className="logo" src={game.away.logo} alt="" width="28" height="28" /> : <span className="logo" />}
          <span className={game.away.winner ? "is-winner" : undefined}>{game.away.short || game.away.name}</span>
          {game.away.score && <span className="score">{game.away.score}</span>}
        </p>
        {home && (
          <p className="side">
            {game.home.logo ? <img className="logo" src={game.home.logo} alt="" width="28" height="28" /> : <span className="logo" />}
            <span className={game.home.winner ? "is-winner" : undefined}>{game.home.short || game.home.name}</span>
            {game.home.score && <span className="score">{game.home.score}</span>}
            <span className="sr-only">{game.neutral ? "versus" : "at"}</span>
          </p>
        )}
        {(game.announcers || game.annotation) && (
          <p className="announcers">
            {[game.annotation, game.announcers].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="where">
        <div className="nets">
          {game.networks.length === 0 && <span className="net" data-net="other">TBD</span>}
          {game.networks.map((network) => {
            const callsign = game.bucket === "local" ? callsignFor(network, stations) : null;
            return (
              <span className="net" data-net={netSlug(network)} key={network}>
                {callsign ? `${callsign} · ${network}` : network}
              </span>
            );
          })}
        </div>
        {showBadge && <MarketBadge game={game} city={city} checking={checking} />}
      </div>
    </article>
  );
}

function MarketBadge({ game, city, checking }: { game: Listing; city: string; checking: boolean }) {
  if (game.bucket === "local" && city) return <span className="badge is-local">On in {city}</span>;
  if (game.bucket === "national") return <span className="badge">National</span>;
  if (game.bucket === "elsewhere" && city) return <span className="badge is-out">Other markets</span>;
  if (game.bucket === "unplaced" && checking) return <span className="badge">Checking…</span>;
  if (game.bucket === "unplaced" && city) return <span className="badge">Varies by market</span>;
  return null;
}

function DayList({
  games,
  timeZone,
  city,
  showBadge,
  checking,
  stations,
  selectedSlug,
  onSelect,
}: {
  games: Listing[];
  timeZone: string;
  city: string;
  showBadge: boolean;
  checking: boolean;
  stations: Station[];
  selectedSlug: string;
  onSelect: (game: Listing) => void;
}) {
  return (
    <>
      {groupByDay(games, timeZone).map((group) => (
        <section key={group.key} className="day">
          <h3>{group.label}</h3>
          {group.games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              timeZone={timeZone}
              city={city}
              showBadge={showBadge}
              checking={checking}
              stations={stations}
              selected={selectedSlug === gameSlug(game)}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
    </>
  );
}

export function Results({
  games,
  view,
  timeZone,
  city,
  checking,
  localReady,
  stations,
  selectedSlug,
  onSelect,
}: {
  games: Listing[];
  view: "local" | "all";
  timeZone: string;
  city: string;
  checking: boolean;
  localReady: boolean;
  stations: Station[];
  selectedSlug: string;
  onSelect: (game: Listing) => void;
}) {
  const list = { timeZone, city, checking, stations, selectedSlug, onSelect };
  if (view === "local" && localReady) {
    const local = games.filter((game) => game.bucket === "local");
    const national = games.filter((game) => game.bucket === "national");
    return (
      <div className="results">
        {local.length > 0 && (
          <section>
            <h2 className="section-label">Local channels</h2>
            <DayList games={local} showBadge={false} {...list} />
          </section>
        )}
        {local.length === 0 && (
          <p className="empty">No FOX or CBS game on this slate matched {city || "this zip"}.</p>
        )}
        {national.length > 0 && (
          <section>
            <h2 className="section-label">National & streaming</h2>
            <DayList games={national} showBadge={false} {...list} />
          </section>
        )}
      </div>
    );
  }

  if (games.length === 0) {
    return <p className="empty">No games on this slate.</p>;
  }

  return (
    <div className="results">
      <DayList games={games} showBadge={localReady || checking} {...list} />
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
