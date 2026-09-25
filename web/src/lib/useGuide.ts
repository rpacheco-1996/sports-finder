import { useEffect, useMemo, useState } from "react";
import { teamByAbbr } from "../data/teams";
import type { Coverage, Place, SportId } from "../types";
import { SPORTS, sportById } from "../types";
import { loadCoverage } from "./coverageData";
import { type EspnGame, loadScoreboard } from "./espn";
import { buildListings } from "./guide";
import { sampleMarket } from "./sample";
import { formatDayHeading, shiftDay, todayKey } from "./time";
import { cachedMarket, lookupStations, type MarketRecord } from "./stations";
import { lookupZip, normalizeZip } from "./zip";

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
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageStatus, setCoverageStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [samples, setSamples] = useState<Record<string, number | null> | null>(null);
  const [checking, setChecking] = useState(false);
  const [board, setBoard] = useState<{ key: string; games: EspnGame[] }>({ key: "", games: [] });
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [espnWeek, setEspnWeek] = useState<number | null>(null);
  const [zipReady, setZipReady] = useState(() => !normalizeZip(initial.zip));
  const [market, setMarket] = useState<MarketRecord | null>(null);
  const [stationsStatus, setStationsStatus] = useState<"idle" | "loading" | "ready" | "missing">("idle");

  const sport = sportById(sportId);
  const shownWeek = sport.id === "nfl" ? nflWeek : cfbWeek ?? espnWeek;
  const hasSample = Boolean(samples && Object.values(samples).some((swatch) => swatch != null));
  const mapsApply = Boolean(
    sport.id === "nfl" && coverage && place && hasSample && nflWeek === coverage.week,
  );
  const mapMiss = Boolean(
    sport.id === "nfl" && coverage && place && samples && !hasSample && nflWeek === coverage.week && coverage.maps.length,
  );

  useEffect(() => {
    const controller = new AbortController();
    loadCoverage(controller.signal)
      .then((data) => {
        setCoverage(data);
        setCoverageStatus(data ? "ready" : "missing");
        if (data) setNflWeek((week) => week ?? data.week);
      })
      .catch(() => setCoverageStatus("missing"));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const zip = normalizeZip(initial.zip);
    if (!zip) return;
    const controller = new AbortController();
    lookupZip(zip, controller.signal)
      .then((found) => {
        if (found) setPlace(found);
        else setZipError("No US city found for that zip code.");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setZipError("Couldn’t look up that zip code. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setZipReady(true);
      });
    return () => controller.abort();
  }, [initial.zip]);

  useEffect(() => {
    if (!place) {
      setMarket(null);
      setStationsStatus("idle");
      return;
    }
    const remembered = cachedMarket(place.zip);
    if (remembered) {
      setMarket(remembered);
      setStationsStatus("ready");
      return;
    }
    const controller = new AbortController();
    setStationsStatus("loading");
    lookupStations(place, controller.signal)
      .then((record) => {
        setMarket(record);
        setStationsStatus(record ? "ready" : "missing");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarket(null);
        setStationsStatus("missing");
      });
    return () => controller.abort();
  }, [place]);

  useEffect(() => {
    const ready = sport.id === "nfl" && coverage && place && nflWeek === coverage.week;
    if (!ready) {
      setSamples(null);
      setChecking(false);
      return;
    }
    let cancel = false;
    setSamples(null);
    setChecking(true);
    sampleMarket(coverage, place)
      .then((next) => {
        if (!cancel) setSamples(next);
      })
      .catch(() => {
        if (!cancel) setSamples(null);
      })
      .finally(() => {
        if (!cancel) setChecking(false);
      });
    return () => {
      cancel = true;
    };
  }, [sport.id, coverage, place, nflWeek]);

  const requestKey = [
    sport.id,
    sport.id === "nfl" ? (nflWeek ?? "") : "",
    sport.id === "ncaaf" ? (cfbWeek ?? "") : "",
    sport.schedule === "day" ? day : "",
  ].join("|");

  useEffect(() => {
    if (sport.id === "nfl" && nflWeek == null && coverageStatus === "loading") return;
    const controller = new AbortController();
    const key = requestKey;
    loadScoreboard(
      sport.id,
      {
        week: sport.schedule === "week" ? (sport.id === "nfl" ? nflWeek : cfbWeek) : null,
        year: sport.id === "nfl" ? coverage?.year : null,
        day: sport.schedule === "day" ? day : null,
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
  }, [requestKey, sport.id, sport.schedule, nflWeek, cfbWeek, day, coverage, coverageStatus]);

  const scheduleError = failure?.key === requestKey ? failure.message : "";
  const scheduleLoading = board.key !== requestKey && !scheduleError;
  const listings = useMemo(
    () =>
      buildListings({
        espn: board.key === requestKey ? board.games : [],
        coverage: sport.id === "nfl" && nflWeek === coverage?.week ? coverage : null,
        samples: mapsApply ? samples : null,
        mapsApply,
        team: sport.id === "nfl" ? team : "",
      }),
    [board, requestKey, sport.id, nflWeek, coverage, samples, mapsApply, team],
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

  async function submitZip(raw = zipInput) {
    const zip = normalizeZip(raw);
    if (!zip) {
      setZipError("Enter a 5-digit US zip code.");
      setPlace(null);
      return;
    }
    setZipInput(zip);
    setZipError("");
    try {
      const found = await lookupZip(zip);
      if (!found) {
        setPlace(null);
        setZipError("No US city found for that zip code.");
        return;
      }
      setPlace(found);
      setView("local");
    } catch {
      setZipError("Couldn’t look up that zip code. Try again.");
    }
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

  const visible = listings.filter((game) =>
    view === "all" || !mapsApply ? true : game.bucket === "local" || game.bucket === "national",
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
    submitZip,
    zipError,
    place,
    market,
    stationsStatus,
    team,
    setTeam,
    followed: sport.id === "nfl" ? teamByAbbr(team) : undefined,
    view,
    setView,
    mapsApply,
    mapMiss,
    checking: checking && !hasSample,
    coverageStatus,
    mappedWeek: coverage?.week ?? null,
    onMappedWeek: sport.id === "nfl" && nflWeek === coverage?.week,
    listings,
    visible,
    scheduleLoading,
    scheduleError,
    periodLabel: sport.schedule === "week" ? `Week ${shownWeek ?? "…"}` : formatDayHeading(day),
    periodDetail: sport.id === "nfl" && coverage && nflWeek === coverage.week ? coverage.titleDate : "",
    step,
    canPrev: sport.schedule === "day" || (shownWeek ?? 1) > 1,
    canNext: sport.schedule === "day" || (shownWeek ?? 1) < 18,
  };
}
