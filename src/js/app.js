import { installAnalytics, track } from "./analytics.js";
import { readRoute, writeRoute, onRoute } from "./router.js";
import { applySeo, gameSlug } from "./seoEngine.js";
import { initTheme } from "./theme.js";

const SPORTS = [
  { id: "nfl", label: "NFL", path: "football/nfl", schedule: "week" },
  { id: "nba", label: "NBA", path: "basketball/nba", schedule: "day" },
  { id: "mlb", label: "MLB", path: "baseball/mlb", schedule: "day" },
  { id: "nhl", label: "NHL", path: "hockey/nhl", schedule: "day" },
  { id: "wnba", label: "WNBA", path: "basketball/wnba", schedule: "day" },
];

const TEAMS = [
  ["ARI", "Cardinals"], ["ATL", "Falcons"], ["BAL", "Ravens"], ["BUF", "Bills"],
  ["CAR", "Panthers"], ["CHI", "Bears"], ["CIN", "Bengals"], ["CLE", "Browns"],
  ["DAL", "Cowboys"], ["DEN", "Broncos"], ["DET", "Lions"], ["GB", "Packers"],
  ["HOU", "Texans"], ["IND", "Colts"], ["JAX", "Jaguars"], ["KC", "Chiefs"],
  ["LV", "Raiders"], ["LAC", "Chargers"], ["LAR", "Rams"], ["MIA", "Dolphins"],
  ["MIN", "Vikings"], ["NE", "Patriots"], ["NO", "Saints"], ["NYG", "Giants"],
  ["NYJ", "Jets"], ["PHI", "Eagles"], ["PIT", "Steelers"], ["SF", "49ers"],
  ["SEA", "Seahawks"], ["TB", "Buccaneers"], ["TEN", "Titans"], ["WSH", "Commanders"],
];

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const STATE_TZ = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
};

const state = {
  sport: "nfl",
  week: null,
  day: todayKey(),
  zip: "",
  game: "",
  team: "",
  place: null,
  market: null,
  listings: null,
  games: [],
  loading: false,
  error: "",
  places: [],
  markets: [],
  listedWeek: null,
  history: "replace",
};

const $ = (selector) => document.querySelector(selector);

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function sportById(id) {
  return SPORTS.find((sport) => sport.id === id) ?? SPORTS[0];
}

function timeZone() {
  return state.place?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatWhen(iso) {
  if (!iso) return { dayKey: "tbd", dayLabel: "Time TBD", timeLabel: "TBD" };
  const date = new Date(iso);
  const zone = timeZone();
  return {
    dayKey: new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date),
    dayLabel: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(date),
    timeLabel: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date),
  };
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  return response.json();
}

async function loadPlaces() {
  const text = await (await fetch("/places.txt")).text();
  return text.split("\n").filter(Boolean).map((line) => {
    const [city, stateCode, zip, lat, lon] = line.split("\t");
    return {
      city,
      state: stateCode,
      stateName: STATE_NAMES[stateCode] || stateCode,
      zip,
      lat: Number(lat),
      lon: Number(lon),
      timeZone: STATE_TZ[stateCode] || "America/New_York",
    };
  });
}

function searchPlaces(query) {
  const text = query.trim().toLowerCase();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  if (/^\d{2,5}$/.test(text)) return state.places.filter((place) => place.zip.startsWith(digits)).slice(0, 8);
  const [cityQuery, stateQuery = ""] = text.split(",").map((part) => part.trim());
  const groups = new Map();
  for (const place of state.places) {
    if (!place.city.toLowerCase().startsWith(cityQuery)) continue;
    if (stateQuery && !place.state.toLowerCase().startsWith(stateQuery) && !place.stateName.toLowerCase().startsWith(stateQuery)) continue;
    const key = `${place.city}|${place.state}`;
    const group = groups.get(key) || [];
    group.push(place);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => group[0]).slice(0, 8);
}

function miles(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function marketFor(place) {
  const ranked = state.markets
    .map((market) => ({ market, miles: miles(place, market) }))
    .filter((item) => item.miles <= 100)
    .sort((a, b) => b.market.pop - a.market.pop || a.miles - b.miles);
  const chosen = ranked[0]?.market;
  if (!chosen) return null;
  return { market: `${chosen.name}, ${chosen.state}`, stations: chosen.stations };
}

function rememberListings(data) {
  if (data?.week == null) return;
  try {
    localStorage.setItem(`cf_listings_week_${data.week}`, JSON.stringify(data));
  } catch { /* ignore */ }
}

function listingsForWeek(week) {
  try {
    const data = JSON.parse(localStorage.getItem(`cf_listings_week_${week}`) || "null");
    return data?.week === week ? data : null;
  } catch {
    return null;
  }
}

function activeListings() {
  if (state.sport !== "nfl" || state.week == null) return state.listings;
  if (state.listings?.week === state.week) return state.listings;
  return listingsForWeek(state.week);
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(episode, away, home) {
  const text = norm(episode);
  const a = norm(away);
  const h = norm(home);
  return Boolean(text && a && h && text.includes(a) && text.includes(h));
}

function isGeneric(name) {
  return /^(tbd|tba|national|local|tv|network)?$/i.test(String(name || "").trim());
}

function classify(game) {
  const listings = activeListings();
  const ready = state.sport === "nfl" && state.place && state.market && listings?.week === state.week;
  const stations = state.market?.stations || [];
  const networks = (game.networks || []).filter((name) => !isGeneric(name));
  const kind = networks.map((name) => name.toUpperCase());
  const regional = ["FOX", "CBS", "NBC", "ABC"].find((name) => kind.some((item) => item.includes(name))) || "";
  const station = stations.find((item) => item.network === regional);
  const rows = station && listings ? listings.games[`${station.callsign}|${regional}`] : undefined;
  const listed = rows?.some((row) => namesMatch(row.episode, game.away.short, game.home.short) || namesMatch(row.episode, game.away.name, game.home.name));
  let bucket = "unplaced";
  if (regional === "FOX" || regional === "CBS") bucket = !ready || !rows ? "unplaced" : listed ? "local" : "elsewhere";
  else if (regional === "NBC" || regional === "ABC") bucket = rows ? (listed ? "local" : "elsewhere") : "local";
  else if (kind.some((name) => /PRIME|AMAZON|NETFLIX|PEACOCK|ESPN|NFL/.test(name))) bucket = "national";
  const sourceUrl = bucket === "local" && station ? listings?.sites?.[`${station.callsign}|${regional}`] || "" : "";
  const callsign = bucket === "local" && station ? `${station.callsign} ${station.channel}` : "";
  return { bucket, sourceUrl, callsign, ready };
}

async function loadScoreboard(refresh) {
  const sport = sportById(state.sport);
  const key = sport.schedule === "week" ? `cf.espn.v2|${sport.id}|week:${state.week || "current"}` : `cf.espn.v2|${sport.id}|day:${state.day}`;
  if (!refresh) {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.board && Date.now() - cached.savedAt < cached.ttl) return cached.board;
    } catch { /* ignore */ }
  }
  const params = new URLSearchParams();
  if (sport.schedule === "week") {
    params.set("seasontype", "2");
    if (state.week) params.set("week", String(state.week));
  } else if (state.day) params.set("dates", state.day.replaceAll("-", ""));
  const query = params.toString();
  const response = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${sport.path}/scoreboard${query ? `?${query}` : ""}`);
  if (!response.ok) throw new Error("Schedule failed to load");
  const data = await response.json();
  const games = (data.events || []).map(parseEvent).filter(Boolean);
  const board = { games, week: data.week?.number ?? null };
  const past = state.day && state.day < todayKey();
  const live = games.some((game) => game.state !== "post" || Date.parse(game.kickoff) > Date.now());
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), ttl: past || !live ? 86400000 : 3600000, board }));
  } catch { /* ignore */ }
  return board;
}

function parseEvent(event) {
  const comp = event.competitions?.[0];
  if (!comp || !event.date) return null;
  const status = comp.status?.type?.state;
  const stateName = status === "in" || status === "post" ? status : "pre";
  const side = (flag) => {
    const competitor = (comp.competitors || []).find((item) => item.homeAway === flag);
    const team = competitor?.team || {};
    return {
      abbr: team.abbreviation || "",
      name: team.displayName || "",
      short: team.shortDisplayName || team.abbreviation || "",
      score: stateName === "pre" ? "" : String(competitor?.score ?? ""),
    };
  };
  const networks = [];
  for (const broadcast of comp.broadcasts || []) {
    for (const name of broadcast.names || []) {
      if (name && !networks.includes(name)) networks.push(name);
    }
  }
  return {
    id: event.id || event.date,
    kickoff: event.date,
    state: stateName,
    detail: comp.status?.type?.shortDetail || (stateName === "post" ? "Final" : ""),
    away: side("away"),
    home: side("home"),
    networks,
    neutral: Boolean(comp.neutralSite),
  };
}

function syncUrl(mode) {
  writeRoute({
    sport: state.sport,
    week: sportById(state.sport).schedule === "week" ? state.week : null,
    day: sportById(state.sport).schedule === "day" ? state.day : "",
    zip: state.place?.zip || state.zip,
    game: state.game,
    team: state.sport === "nfl" ? state.team : "",
  }, mode || state.history);
  state.history = "replace";
}

function refreshSeo() {
  const sport = sportById(state.sport);
  const game = state.games.find((item) => gameSlug(item) === state.game) || null;
  const params = new URLSearchParams();
  if (game) {
    params.set("sport", sport.id);
    params.set("game", gameSlug(game));
  } else if (sport.id !== "nfl") {
    params.set("sport", sport.id);
    if (state.day) params.set("day", state.day);
  } else if (state.week) {
    params.set("sport", "nfl");
    params.set("week", String(state.week));
  }
  applySeo({
    sport,
    game,
    dateLabel: game ? formatWhen(game.kickoff).dayLabel : "",
    params,
  });
}

function render() {
  const sport = sportById(state.sport);
  document.querySelectorAll(".pill").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.sport === sport.id);
  });
  $("#team-field").hidden = sport.id !== "nfl";
  $("#period").textContent = sport.schedule === "week" ? `Week ${state.week || "…"}` : formatWhen(`${state.day}T12:00:00`).dayLabel;
  const listings = activeListings();
  const ready = sport.id === "nfl" && state.place && state.market && listings?.week === state.week;
  const note = $("#note");
  if (sport.id !== "nfl") note.textContent = "Station schedules on this page cover NFL games. This list shows the network each game is on.";
  else if (!ready && state.week && listings && listings.week !== state.week) note.textContent = "Local station maps are optimized for the current NFL week.";
  else if (ready) note.textContent = "";
  else if (!state.place) note.textContent = "Enter a city or zip to see which games are on the local stations.";
  else note.textContent = "";

  const place = $("#place");
  if (state.place) {
    const majors = ["FOX", "CBS", "NBC", "ABC"].flatMap((network) => {
      const station = state.market?.stations.find((item) => item.network === network);
      return station ? [`${station.callsign} ${station.channel} ${network}`] : [];
    });
    place.hidden = false;
    place.innerHTML = `<strong>${state.place.city}, ${state.place.stateName}</strong> <span>${state.place.zip}</span><p class="stations">${state.market ? `${state.market.market} · ${majors.join(" · ")}` : "No nearby TV market on file."}</p>`;
  } else place.hidden = true;

  const board = $("#games");
  board.innerHTML = "";
  if (state.loading) {
    board.innerHTML = `<div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>`;
    $("#error").textContent = "";
    return;
  }
  $("#error").textContent = state.error;
  if (!state.games.length) {
    board.innerHTML = `<p class="empty">No games on this slate.</p>`;
    refreshSeo();
    return;
  }
  let lastDay = "";
  for (const game of state.games) {
    const when = formatWhen(game.kickoff);
    const info = classify(game);
    if (when.dayKey !== lastDay) {
      lastDay = when.dayKey;
      const label = document.createElement("h3");
      label.className = "day-label";
      label.textContent = when.dayLabel;
      board.append(label);
    }
    const card = document.createElement("button");
    card.type = "button";
    card.className = `card${game.state === "in" ? " is-live" : ""}${gameSlug(game) === state.game ? " is-selected" : ""}`;
    const nets = game.networks.length ? game.networks : ["TBD"];
    const badges = nets.map((network) => {
      const regional = ["FOX", "CBS", "NBC", "ABC"].find((name) => network.toUpperCase().includes(name));
      const station = info.bucket === "local" && regional
        ? (state.market?.stations || []).find((item) => item.network === regional)
        : null;
      const label = station ? `${station.callsign} ${station.channel} · ${network}` : network;
      const tone = info.bucket === "local" ? "local" : info.bucket === "national" ? "national" : info.bucket === "elsewhere" ? "out" : "";
      return `<span class="badge ${tone}">${label}</span>`;
    }).join("");
    card.innerHTML = `
      <div class="when">${info.sourceUrl ? `<a href="${info.sourceUrl}" target="_blank" rel="noreferrer">${when.timeLabel}</a>` : `<span>${when.timeLabel}</span>`}${game.detail ? `<span class="status">${game.detail}</span>` : ""}</div>
      <div>
        <p class="side"><span>${game.away.short || game.away.name}</span><span class="score">${game.away.score || ""}</span></p>
        <p class="side"><span>${game.home.short || game.home.name}</span><span class="score">${game.home.score || ""}</span></p>
      </div>
      <div class="badges">${badges}</div>`;
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      const slug = gameSlug(game);
      state.history = "push";
      state.game = state.game === slug ? "" : slug;
      if (state.game) track("view_game_details", { matchup: `${game.away.short} vs ${game.home.short}`, channel: game.networks[0] || "TBD" });
      syncUrl("push");
      render();
    });
    board.append(card);
  }
  refreshSeo();
}

async function loadBoard(refresh) {
  state.loading = true;
  state.error = "";
  render();
  try {
    const board = await loadScoreboard(Boolean(refresh));
    state.games = board.games;
    if (sportById(state.sport).schedule === "week" && !state.week && board.week) state.week = board.week;
  } catch (error) {
    state.games = [];
    state.error = "The schedule didn’t load. Check your connection and try again.";
  }
  state.loading = false;
  render();
}

function choosePlace(place) {
  state.place = place;
  state.zip = place.zip;
  state.market = marketFor(place);
  state.history = "push";
  $("#query").value = `${place.city}, ${place.state} ${place.zip}`;
  $("#suggest").hidden = true;
  syncUrl("push");
  render();
}

function applyRoute(route) {
  const nextSport = sportById(route.sport).id;
  const sportChanged = nextSport !== state.sport;
  state.sport = nextSport;
  state.week = route.week;
  if (route.day) state.day = route.day;
  state.game = route.game || "";
  state.team = route.team || "";
  state.zip = route.zip || "";
  if (state.places.length && state.zip) {
    state.place = state.places.find((place) => place.zip === state.zip) || state.place;
    if (state.place) state.market = marketFor(state.place);
  }
  if (sportChanged) track("select_sport", { league: state.sport });
  syncUrl("replace");
  loadBoard(false);
}

function bind() {
  $("#leagues").innerHTML = SPORTS.map((sport) => `<button class="pill" type="button" data-sport="${sport.id}">${sport.label}</button>`).join("");
  $("#leagues").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sport]");
    if (!button || button.dataset.sport === state.sport) return;
    state.sport = button.dataset.sport;
    state.game = "";
    state.history = "push";
    track("select_sport", { league: state.sport });
    syncUrl("push");
    loadBoard(false);
  });
  const select = $("#team");
  select.innerHTML = `<option value="">Follow a team</option>${TEAMS.map(([abbr, name]) => `<option value="${abbr}">${name}</option>`).join("")}`;
  select.addEventListener("change", () => {
    state.team = select.value;
    const name = TEAMS.find(([abbr]) => abbr === state.team)?.[1];
    if (name) track("search_team", { team_query: name });
    state.history = "push";
    syncUrl("push");
  });
  const input = $("#query");
  const list = $("#suggest");
  input.addEventListener("input", () => {
    const found = searchPlaces(input.value);
    list.innerHTML = found.map((place, index) => `<li><button type="button" data-index="${index}">${place.city}, ${place.state} ${place.zip}</button></li>`).join("");
    list.hidden = found.length === 0;
    list._places = found;
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    choosePlace(list._places[Number(button.dataset.index)]);
  });
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  $("#refresh").addEventListener("click", () => loadBoard(true));
  document.querySelector(".search").addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll(".example").forEach((button) => {
    button.addEventListener("click", () => {
      const place = state.places.find((item) => item.zip === button.dataset.zip);
      if (place) choosePlace(place);
    });
  });
  onRoute((route) => applyRoute(route));
}

function step(delta) {
  const sport = sportById(state.sport);
  state.history = "push";
  state.game = "";
  if (sport.schedule === "day") {
    const date = new Date(`${state.day}T12:00:00`);
    date.setDate(date.getDate() + delta);
    state.day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } else {
    state.week = Math.min(18, Math.max(1, (state.week || 1) + delta));
  }
  syncUrl("push");
  loadBoard(false);
}

async function boot() {
  installAnalytics();
  initTheme();
  bind();
  try {
    const [places, markets, listings] = await Promise.all([
      loadPlaces(),
      loadJson("/data/markets.json"),
      loadJson("/listings.json").catch(() => null),
    ]);
    state.places = places;
    state.markets = markets;
    state.listings = listings;
    state.listedWeek = listings?.week ?? null;
    if (listings) rememberListings(listings);
  } catch {
    state.error = "The place list didn’t load.";
  }
  const route = readRoute();
  if (!route.day) route.day = state.day;
  applyRoute(route);
}

boot();
