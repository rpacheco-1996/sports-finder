const listeners = new Set();

export function readRoute() {
  const query = new URLSearchParams(window.location.search);
  const week = Number(query.get("week"));
  return {
    sport: (query.get("sport") || "nfl").toLowerCase(),
    week: Number.isFinite(week) && week > 0 ? week : null,
    day: query.get("day") || "",
    zip: query.get("zip") || "",
    game: query.get("game") || "",
    team: (query.get("team") || "").toUpperCase(),
  };
}

export function writeRoute(route, mode = "replace") {
  const url = new URL(window.location.href);
  const put = (key, value) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  put("zip", route.zip || "");
  put("sport", route.sport || "nfl");
  put("team", route.team || "");
  put("week", route.week ? String(route.week) : "");
  put("day", route.day || "");
  put("game", route.game || "");
  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export function onRoute(handler) {
  const wrapped = () => {
    try {
      handler(readRoute());
    } catch {
      /* Ignore a history event the page cannot apply. */
    }
  };
  listeners.add(wrapped);
  window.addEventListener("popstate", wrapped);
  return () => {
    listeners.delete(wrapped);
    window.removeEventListener("popstate", wrapped);
  };
}
