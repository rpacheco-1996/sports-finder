import { useEffect, useMemo, useRef, useState } from "react";
import { teamByAbbr } from "../data/teams";
import type { Place, SportId } from "../types";
import { SPORTS, sportById } from "../types";
import { type EspnGame, loadScoreboard } from "./espn";
import { buildListings } from "./guide";
import { listingsForWeek, loadListings, type StationListings } from "./listings";
import { formatDayHeading, shiftDay, todayKey } from "./time";
import { loadPlaces, placeByZip, placeLabel } from "./places";
import { loadMarkets, marketFor, type MarketRecord } from "./stations";
import { normalizeZip } from "./zip";

const PREFS_KEY = "cf.prefs.v1";

type View = "local" | "all";

function readPrefs(): { zip?: string; sport?: string; team?: string } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { zip?: string; sport?: string; team?: string };
  } catch {
    return {};
  }
}

function initialState() {
  const query = new URLSearchParams(window.location.search);
  const prefs = readPrefs();
  const sport = sportById(query.get("sport") || prefs.sport || "nfl").id;
  const week = Number(query.get("week"));
  const hasWeek = Number.isFinite(week) && week > 0;
  return {
    sport,
    zip: query.get("zip") || prefs.zip || "",
    team: (query.get("team") || prefs.team || "").toUpperCase(),
    nflWeek: sport === "nfl" && hasWeek ? week : null,
    cfbWeek: sport === "ncaaf" && hasWeek ? week : null,
    day: query.get("day") || todayKey(),
  };
}

export function useGuide() {
  const initial = useMemo(initialState, []);
  const [sportId, setSportId] = useState<SportId>(initial.sport);
  const [zipInput, setZipInput] = useState(initial.zip);
  const [place, setPlace] = useState<Place | null>(null);
  const [zipError, setZipError] = useState("");
  const [team, setTeam] = useState(initial.team);
  const [nflWeek, setNflWeek] = useState<number | null>(initial.nflWeek);
  const [cfbWeek, setCfbWeek] = useState<number | null>(initial.cfbWeek);
  const [day, setDay] = useState(initial.day);
  const [view, setView] = useState<View>("local");
  const [listings, setStationListings] = useState<StationListings | null>(null);
  const [listingsStatus, setListingsStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [board, setBoard] = useState<{ key: string; games: EspnGame[] }>({ key: "", games: [] });
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [espnWeek, setEspnWeek] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const forceRefresh = useRef(false);
  const [zipReady, setZipReady] = useState(() => !normalizeZip(initial.zip));
  const [market, setMarket] = useState<MarketRecord | null>(null);
  const [stationsStatus, setStationsStatus] = useState<"idle" | "loading" | "ready" | "missing">("idle");

  const sport = sportById(sportId);
  const shownWeek = sport.id === "nfl" ? nflWeek : cfbWeek ?? espnWeek;
  const activeListings = useMemo(() => {
    if (sport.id === "nfl" && nflWeek != null) {
      if (listings?.week === nflWeek) return listings;
      return listingsForWeek(nflWeek);
    }
    return listings;
  }, [sport.id, nflWeek, listings]);
  const localReady = Boolean(
    sport.id === "nfl" &&
      activeListings &&
      place &&
      market &&
      nflWeek != null &&
      nflWeek === activeListings.week,
  );
  const checking = Boolean(place && (listingsStatus === "loading" || stationsStatus === "loading"));

  useEffect(() => {
    let cancel = false;
    loadListings()
      .then((data) => {
        if (cancel) return;
        setStationListings(data);
        setListingsStatus(data ? "ready" : "missing");
        if (data?.week) setNflWeek((week) => week ?? data.week);
      })
      .catch(() => {
        if (!cancel) setListingsStatus("missing");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const zip = normalizeZip(initial.zip);
    if (!zip) {
      setZipReady(true);
      return;
    }
    let cancel = false;
    loadPlaces()
      .then((places) => {
        if (cancel) return;
        const found = placeByZip(places, zip);
        if (found) {
          setPlace(found);
          setZipInput(placeLabel(found));
        } else {
          setZipError("No US city found for that zip code.");
        }
        setZipReady(true);
      })
      .catch(() => {
        if (!cancel) {
          setZipError("Couldn’t load the place list. Try again.");
          setZipReady(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, [initial.zip]);

  useEffect(() => {
    if (!place) {
      setMarket(null);
      setStationsStatus("idle");
      return;
    }
    let cancel = false;
    setStationsStatus("loading");
    loadMarkets()
      .then((markets) => {
        if (cancel) return;
        const record = marketFor(place, markets);
        setMarket(record);
        setStationsStatus(record ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancel) {
          setMarket(null);
          setStationsStatus("missing");
        }
      });
    return () => {
      cancel = true;
    };
  }, [place]);

  const requestKey = [
    sport.id,
    sport.id === "nfl" ? (nflWeek ?? "") : "",
    sport.id === "ncaaf" ? (cfbWeek ?? "") : "",
    sport.schedule === "day" ? day : "",
  ].join("|");

  useEffect(() => {
    if (sport.id === "nfl" && nflWeek == null && listingsStatus === "loading") return;
    const controller = new AbortController();
    const key = requestKey;
    const refresh = forceRefresh.current;
    forceRefresh.current = false;
    loadScoreboard(
      sport.id,
      {
        week: sport.schedule === "week" ? (sport.id === "nfl" ? nflWeek : cfbWeek) : null,
        year: null,
        day: sport.schedule === "day" ? day : null,
        refresh,
      },
      controller.signal,
    )
      .then((next) => {
        setBoard({ key, games: next.games });
        setFailure(null);
        setEspnWeek(next.week);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBoard({ key, games: [] });
        setFailure({ key, message: "The schedule didn’t load. Check your connection and try again." });
      });
    return () => controller.abort();
  }, [requestKey, sport.id, sport.schedule, nflWeek, cfbWeek, day, listingsStatus, reloadToken]);

  const scheduleError = failure?.key === requestKey ? failure.message : "";
  const scheduleLoading = board.key !== requestKey && !scheduleError;
  const games = useMemo(
    () =>
      buildListings({
        espn: board.key === requestKey ? board.games : [],
        airings: localReady && activeListings ? activeListings.games : {},
        sites: activeListings?.sites ?? {},
        stations: market?.stations ?? [],
        localReady,
        team: sport.id === "nfl" ? team : "",
      }),
    [board, requestKey, localReady, activeListings, market, sport.id, team],
  );

  useEffect(() => {
    if (!zipReady) return;
    const url = new URL(window.location.href);
    const put = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    put("zip", place?.zip ?? "");
    put("sport", sport.id);
    put("team", sport.id === "nfl" ? team : "");
    put("week", sport.schedule === "week" && shownWeek ? String(shownWeek) : "");
    put("day", sport.schedule === "day" ? day : "");
    window.history.replaceState(null, "", url);
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ zip: place?.zip ?? "", sport: sport.id, team }),
    );
  }, [zipReady, place, sport.id, sport.schedule, team, shownWeek, day]);

  function refreshSchedule() {
    forceRefresh.current = true;
    setBoard({ key: "", games: [] });
    setFailure(null);
    setReloadToken((token) => token + 1);
  }

  function selectPlace(next: Place) {
    setPlace(next);
    setZipInput(placeLabel(next));
    setZipError("");
    setView("local");
  }

  function step(delta: number) {
    if (sport.schedule === "day") {
      setDay((current) => shiftDay(current, delta));
      return;
    }
    const current = shownWeek ?? 1;
    const next = Math.min(18, Math.max(1, current + delta));
    if (sport.id === "nfl") setNflWeek(next);
    else setCfbWeek(next);
  }

  const visible = games.filter((game) =>
    view === "all" || !localReady ? true : game.bucket === "local" || game.bucket === "national",
  );

  return {
    sports: SPORTS,
    sport,
    setSportId: (id: SportId) => {
      setSportId(id);
      setView("local");
    },
    zipInput,
    setZipInput,
    selectPlace,
    zipError,
    place,
    market,
    stationsStatus,
    team,
    setTeam,
    followed: sport.id === "nfl" ? teamByAbbr(team) : undefined,
    view,
    setView,
    localReady,
    checking,
    listingsStatus,
    listedWeek: listings?.week ?? null,
    onListedWeek: sport.id === "nfl" && activeListings != null && nflWeek === activeListings.week,
    listings: games,
    visible,
    scheduleLoading,
    scheduleError,
    refreshSchedule,
    periodLabel: sport.schedule === "week" ? `Week ${shownWeek ?? "…"}` : formatDayHeading(day),
    periodDetail: "",
    step,
    canPrev: sport.schedule === "day" || (shownWeek ?? 1) > 1,
    canNext: sport.schedule === "day" || (shownWeek ?? 1) < 18,
  };
}
