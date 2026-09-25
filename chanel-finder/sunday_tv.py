#!/usr/bin/env python3
"""Sunday NFL TV finder for YouTube TV in Boise, ID and Spirit Lake, IA.

Pulls the week's schedule from ESPN, scrapes 506sports coverage maps, samples
each market's DMA color on those maps, and prints which local YTTV channels
carry which games — with 49ers games highlighted.
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

import cloudscraper
import requests
from bs4 import BeautifulSoup
from PIL import Image

# --- Markets / YouTube TV local affiliates ---------------------------------

MARKETS: dict[str, dict] = {
    "boise": {
        "label": "Boise, ID",
        "zip": "83702",
        "lon": -116.2146,
        "lat": 43.6150,
        "tz": ZoneInfo("America/Boise"),
        "tz_abbr": "MT",
        "channels": {
            "FOX": ("KNIN", "FOX"),
            "CBS": ("KBOI", "CBS"),
            "NBC": ("KTVB", "NBC"),
            "ABC": ("KIVI", "ABC"),
            "ESPN": ("ESPN", "ESPN"),
            "NFLN": ("NFL Network", "NFLN"),
            "PRIME": ("Prime Video", "Prime"),
            "NETFLIX": ("Netflix", "Netflix"),
            "PEACOCK": ("Peacock", "Peacock"),
        },
    },
    "spirit_lake": {
        "label": "Spirit Lake, IA (Sioux City DMA)",
        "zip": "51360",
        "lon": -95.1022,
        "lat": 43.4222,
        "tz": ZoneInfo("America/Chicago"),
        "tz_abbr": "CT",
        "channels": {
            "FOX": ("KPTH", "FOX"),
            "CBS": ("KMEG", "CBS"),
            "NBC": ("KTIV", "NBC"),
            "ABC": ("KCAU", "ABC"),
            "ESPN": ("ESPN", "ESPN"),
            "NFLN": ("NFL Network", "NFLN"),
            "PRIME": ("Prime Video", "Prime"),
            "NETFLIX": ("Netflix", "Netflix"),
            "PEACOCK": ("Peacock", "Peacock"),
        },
    },
}

NINERS_ALIASES = {"sf", "sfo", "49ers", "san francisco", "san francisco 49ers"}

# Calibrated Albers (CONUS) → 506sports 1280×720 map pixels.
# Fit against Week 3 2026 FOX map city colors (BOI/SEA/SF/MIN/PHX/DET/BUF).
MAP_SCALE = 1390.0
MAP_TX = 665.0
MAP_TY = 415.0

CACHE_DIR = Path(__file__).resolve().parent / "cache"
BASE_506 = "https://506sports.com"
ESPN_SCOREBOARD = "https://cdn.espn.com/core/nfl/scoreboard"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ANSI
BOLD = "\033[1m"
GOLD = "\033[38;5;220m"
GREEN = "\033[32m"
DIM = "\033[2m"
RED = "\033[31m"
RESET = "\033[0m"
USE_COLOR = sys.stdout.isatty()


def c(text: str, *codes: str) -> str:
    if not USE_COLOR:
        return text
    return "".join(codes) + text + RESET


# --- Projection / color matching ------------------------------------------

def albers_xy(lon: float, lat: float) -> tuple[float, float]:
    """Project lon/lat to 506sports map pixel coords (CONUS Albers)."""
    phi1, phi2 = math.radians(29.5), math.radians(45.5)
    phi0, lam0 = math.radians(38.0), math.radians(-96.0)
    n = (math.sin(phi1) + math.sin(phi2)) / 2
    big_c = math.cos(phi1) ** 2 + 2 * n * math.sin(phi1)
    rho0 = math.sqrt(big_c - 2 * n * math.sin(phi0)) / n
    lam, phi = math.radians(lon), math.radians(lat)
    rho = math.sqrt(big_c - 2 * n * math.sin(phi)) / n
    theta = n * (lam - lam0)
    x = rho * math.sin(theta)
    y = rho0 - rho * math.cos(theta)
    return MAP_TX + MAP_SCALE * x, MAP_TY - MAP_SCALE * y


def swatch_rgb(path: Path) -> tuple[int, int, int]:
    im = Image.open(path).convert("RGBA")
    counts: Counter[tuple[int, int, int]] = Counter()
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            counts[(r, g, b)] += 1
    return counts.most_common(1)[0][0]


def nearest_swatch(
    rgb: tuple[int, int, int],
    palette: dict[int, tuple[int, int, int]],
    thresh: float = 55.0,
) -> int | None:
    if max(rgb) - min(rgb) < 25:
        return None
    best_id, best_d = None, None
    for sid, col in palette.items():
        d = math.sqrt(sum((a - b) ** 2 for a, b in zip(rgb, col)))
        if best_d is None or d < best_d:
            best_id, best_d = sid, d
    return best_id if best_d is not None and best_d < thresh else None


def sample_swatch(
    im: Image.Image,
    lon: float,
    lat: float,
    palette: dict[int, tuple[int, int, int]],
    radius: int = 8,
) -> int | None:
    x, y = albers_xy(lon, lat)
    w, h = im.size
    votes: Counter[int] = Counter()
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            xx, yy = int(x) + dx, int(y) + dy
            if 0 <= xx < w and 0 <= yy < h:
                sid = nearest_swatch(im.getpixel((xx, yy)), palette)
                if sid is not None:
                    votes[sid] += 1
    return votes.most_common(1)[0][0] if votes else None


# --- Data models ----------------------------------------------------------

@dataclass
class Game:
    matchup: str
    network: str  # FOX / CBS / NBC / ESPN / …
    window: str  # EARLY / LATE / SINGLE / NATIONAL / …
    swatch: int | None = None
    kickoff_utc: datetime | None = None
    away: str = ""
    home: str = ""
    is_niners: bool = False
    national: bool = False


@dataclass
class WeekData:
    year: int
    week: int
    title_date: str = ""
    games: list[Game] = field(default_factory=list)
    # map_key -> path, e.g. "FOX|EARLY" -> cache/...png
    maps: dict[str, Path] = field(default_factory=dict)
    palette: dict[int, tuple[int, int, int]] = field(default_factory=dict)


# --- HTTP helpers ---------------------------------------------------------

def scraper() -> cloudscraper.CloudScraper:
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "darwin", "mobile": False}
    )


def fetch_bytes(url: str, session: cloudscraper.CloudScraper | None = None) -> bytes:
    s = session or scraper()
    r = s.get(url, headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    return r.content


def current_espn_week() -> tuple[int, int]:
    """Return (season_year, week_number) from ESPN scoreboard."""
    headers = {"User-Agent": UA}
    # Prefer site.web.api (cdn.espn.com is often bot-blocked).
    urls = [
        (
            "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
            {},
        ),
        (ESPN_SCOREBOARD, {"xhr": 1, "limit": 100}),
    ]
    last_err: Exception | None = None
    for url, params in urls:
        try:
            r = requests.get(url, params=params, headers=headers, timeout=30)
            r.raise_for_status()
            data = r.json()
            sb = data.get("content", {}).get("sbData") or data.get("content") or data
            # site.web.api puts season/week at top level
            season = sb.get("season") or data.get("season")
            week = sb.get("week") or data.get("week")
            if not season or not week:
                # dig through leagues
                leagues = data.get("leagues") or sb.get("leagues") or []
                if leagues:
                    season = season or leagues[0].get("season")
                week = week or data.get("week")
            year = int(season["year"]) if isinstance(season, dict) else int(season)
            num = int(week["number"]) if isinstance(week, dict) else int(week)
            return year, num
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"ESPN week lookup failed: {last_err}")


def espn_sunday_games(year: int, week: int) -> list[dict]:
    """All games for the given REG week from ESPN (any day)."""
    # ESPN week scoreboard: dates param optional; week/seasontype more reliable via
    # site.web.api when available. Fall back to scraping dates from season.
    r = requests.get(
        "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
        params={"seasontype": 2, "week": week, "dates": year},
        headers={"User-Agent": UA},
        timeout=30,
    )
    if r.status_code != 200:
        r = requests.get(
            ESPN_SCOREBOARD,
            params={"xhr": 1, "seasontype": 2, "week": week, "limit": 100},
            headers={"User-Agent": UA},
            timeout=30,
        )
        r.raise_for_status()
        payload = r.json()
        sb = payload.get("content", {}).get("sbData") or payload.get("content") or payload
        events = sb.get("events") or []
    else:
        events = r.json().get("events") or []

    out = []
    for e in events:
        comp = e["competitions"][0]
        competitors = {c["homeAway"]: c for c in comp["competitors"]}
        away = competitors["away"]["team"]
        home = competitors["home"]["team"]
        networks: list[str] = []
        for b in comp.get("broadcasts") or []:
            networks.extend(b.get("names") or [])
        kickoff = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
        out.append(
            {
                "name": e.get("name") or e.get("shortName"),
                "short": e.get("shortName"),
                "away": away.get("displayName") or away.get("name"),
                "home": home.get("displayName") or home.get("name"),
                "away_abbr": away.get("abbreviation", ""),
                "home_abbr": home.get("abbreviation", ""),
                "networks": networks,
                "kickoff": kickoff,
                "date_local": kickoff.astimezone(timezone.utc).date(),
            }
        )
    return out


# --- 506sports scrape -----------------------------------------------------

SECTION_RE = re.compile(
    r"(?P<section>NATIONAL BROADCASTS|CBS(?:\s+(?:EARLY|LATE|SINGLE))?|"
    r"FOX(?:\s+(?:EARLY|LATE|SINGLE))?)\s*$",
    re.I,
)


def _normalize_section(raw: str) -> tuple[str, str]:
    """Return (network, window) e.g. ('FOX','EARLY'), ('CBS','SINGLE'), ('NATIONAL','NATIONAL')."""
    s = re.sub(r"\s+", " ", raw.strip().upper())
    if s.startswith("NATIONAL"):
        return "NATIONAL", "NATIONAL"
    parts = s.split()
    net = parts[0]
    window = parts[1] if len(parts) > 1 else "SINGLE"
    return net, window


def _is_niners(text: str) -> bool:
    t = text.lower()
    return any(a in t for a in NINERS_ALIASES)


def parse_506_page(html: str, year: int, week: int, session: cloudscraper.CloudScraper) -> WeekData:
    soup = BeautifulSoup(html, "lxml")
    data = WeekData(year=year, week=week)

    h3 = soup.find("h3")
    if h3:
        data.title_date = h3.get_text(" ", strip=True)

    # Build palette from swatch images referenced on the page (fall back to 1-6).
    swatch_ids = sorted({int(m) for m in re.findall(r"nfl/swatches/(\d+)\.png", html)})
    if not swatch_ids:
        swatch_ids = list(range(1, 7))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for sid in swatch_ids:
        path = CACHE_DIR / f"swatch_{sid}.png"
        if not path.exists():
            path.write_bytes(fetch_bytes(f"{BASE_506}/nfl/swatches/{sid}.png", session))
        data.palette[sid] = swatch_rgb(path)

    # Walk the article: section headers, map images, game rows.
    article = soup.find("article") or soup
    current_net, current_win = None, None
    pending_map_src: str | None = None
    # Games belonging to current section, assigned swatches in order of appearance.
    section_games: list[Game] = []

    def flush_map():
        nonlocal pending_map_src, section_games
        if pending_map_src and current_net and current_net != "NATIONAL":
            key = f"{current_net}|{current_win}"
            local = CACHE_DIR / f"{year}_w{week:02d}_{current_net}_{current_win}.png"
            if not local.exists():
                url = pending_map_src if pending_map_src.startswith("http") else f"{BASE_506}/{pending_map_src}"
                local.write_bytes(fetch_bytes(url, session))
            data.maps[key] = local
        pending_map_src = None

    def start_section(net: str, win: str):
        nonlocal current_net, current_win, section_games
        flush_map()
        current_net, current_win = net, win
        section_games = []

    # National broadcast blocks use id="cgame"
    for cgame in soup.select("div#cgame"):
        matchup = (cgame.select_one("#cmatchup") or cgame).get_text(" ", strip=True)
        ntwk_el = cgame.select_one("#cntwk")
        time_el = cgame.select_one("#ctime")
        network = (ntwk_el.get_text(" ", strip=True) if ntwk_el else "NATIONAL").upper()
        # Normalize common network labels
        if "NBC" in network:
            network = "NBC"
        elif "ESPN" in network or "ABC" in network:
            network = "ESPN" if "ESPN" in network else "ABC"
        elif "PRIME" in network or "AMAZON" in network:
            network = "PRIME"
        elif "NETFLIX" in network:
            network = "NETFLIX"
        elif "NFL" in network:
            network = "NFLN"
        g = Game(
            matchup=matchup,
            network=network,
            window="NATIONAL",
            national=True,
            is_niners=_is_niners(matchup),
        )
        if time_el:
            g.matchup = f"{matchup}"  # time kept in ESPN merge
        data.games.append(g)

    # Regional sections: look for size=5 headers and subsequent #game / #map
    # Parse via regex over HTML for robustness against quirky markup.
    # Split on section headers.
    parts = re.split(
        r'<b><font size="5">([^<]+)</font></b>|<p><b><font size="5">([^<]+)</font></b></p>',
        html,
        flags=re.I,
    )
    # parts[0]=preamble, then (title|None), (None|title), chunk, ...
    i = 1
    while i < len(parts):
        title = (parts[i] or parts[i + 1] or "").strip()
        chunk = parts[i + 2] if i + 2 < len(parts) else ""
        i += 3
        m = SECTION_RE.search(title)
        if not m or title.upper().startswith("NATIONAL"):
            continue
        net, win = _normalize_section(title)
        start_section(net, win)

        map_m = re.search(r'<div id="map">\s*<img src="([^"]+)"', chunk)
        if map_m:
            pending_map_src = map_m.group(1)
            flush_map()

        # Games with swatch squares
        for gm in re.finditer(
            r"id=['\"]square['\"]>\s*<img src=['\"]nfl/swatches/(\d+)\.png['\"]"
            r".*?id=['\"]matchup['\"]>(.*?)</div>",
            chunk,
            flags=re.I | re.S,
        ):
            sid = int(gm.group(1))
            matchup = BeautifulSoup(gm.group(2), "lxml").get_text(" ", strip=True)
            matchup = re.sub(r"\s+", " ", matchup)
            g = Game(
                matchup=matchup,
                network=net,
                window=win,
                swatch=sid,
                is_niners=_is_niners(matchup),
            )
            data.games.append(g)

    return data


def load_week(year: int, week: int) -> WeekData:
    session = scraper()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    html_path = CACHE_DIR / f"506_{year}_w{week:02d}.html"
    url = f"{BASE_506}/nfl.php?yr={year}&wk={week}"
    html = fetch_bytes(url, session).decode("utf-8", errors="replace")
    html_path.write_text(html)
    if "Just a moment" in html or "cf-chl" in html:
        raise RuntimeError(
            "506sports Cloudflare challenge blocked the request. "
            "Try again in a moment, or open the page in a browser once."
        )
    return parse_506_page(html, year, week, session)


# --- Merge ESPN times into 506 matchups -----------------------------------

def _norm_matchup(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = s.replace("@", " at ").replace(" vs ", " at ").replace(" versus ", " at ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # common nicknames
    repl = {
        "la rams": "rams",
        "la chargers": "chargers",
        "los angeles rams": "rams",
        "los angeles chargers": "chargers",
        "ny jets": "jets",
        "ny giants": "giants",
        "new york jets": "jets",
        "new york giants": "giants",
        "san francisco": "49ers",
        "sf": "49ers",
        "washington": "commanders",
        "wsh": "commanders",
    }
    for a, b in repl.items():
        s = re.sub(rf"\b{re.escape(a)}\b", b, s)
    return s


def attach_espn_times(week: WeekData, espn_games: list[dict]) -> None:
    for g in week.games:
        target = _norm_matchup(g.matchup)
        best = None
        best_score = 0
        for eg in espn_games:
            cand = _norm_matchup(f"{eg['away']} at {eg['home']}")
            # token overlap
            ta, tb = set(target.split()), set(cand.split())
            score = len(ta & tb)
            if score > best_score:
                best_score, best = score, eg
        if best and best_score >= 2:
            g.kickoff_utc = best["kickoff"]
            g.away = best["away"]
            g.home = best["home"]
            g.is_niners = g.is_niners or best["away_abbr"] == "SF" or best["home_abbr"] == "SF"


# --- Market resolution ----------------------------------------------------

def resolve_market_games(week: WeekData, market_key: str) -> list[tuple[Game, str, str]]:
    """Return list of (game, callsign, network_label) airing in this market."""
    mkt = MARKETS[market_key]
    lon, lat = mkt["lon"], mkt["lat"]
    results: list[tuple[Game, str, str]] = []

    # National / package games always "air" (on the named network/app).
    for g in week.games:
        if g.national:
            ch = _channel_for_network(mkt, g.network)
            results.append((g, ch[0], ch[1]))

    # Regional FOX/CBS via map sampling
    for key, path in week.maps.items():
        net, window = key.split("|", 1)
        im = Image.open(path).convert("RGB")
        sid = sample_swatch(im, lon, lat, week.palette)
        if sid is None:
            continue
        for g in week.games:
            if g.national or g.network != net or g.swatch != sid:
                continue
            # EARLY/LATE maps must match the game window; SINGLE maps match any.
            if window != "SINGLE" and g.window not in (window, "SINGLE"):
                continue
            ch = _channel_for_network(mkt, net)
            results.append((g, ch[0], ch[1]))

    # de-dupe by matchup+network
    seen = set()
    uniq = []
    for item in results:
        k = (item[0].matchup, item[0].network)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(item)
    uniq.sort(key=lambda t: t[0].kickoff_utc or datetime.max.replace(tzinfo=timezone.utc))
    return uniq


def _channel_for_network(mkt: dict, network: str) -> tuple[str, str]:
    net = network.upper()
    if net in mkt["channels"]:
        return mkt["channels"][net]
    # fuzzy
    for key, val in mkt["channels"].items():
        if key in net or net in key:
            return val
    return (network, network)


# --- Display --------------------------------------------------------------

def fmt_time(dt: datetime | None, tz: ZoneInfo, abbr: str) -> str:
    if dt is None:
        return f"TBD {abbr}"
    local = dt.astimezone(tz)
    return local.strftime(f"%-I:%M %p {abbr}")


def print_report(week: WeekData, espn_games: list[dict]) -> None:
    header = f"NFL Week {week.week}, {week.year}"
    if week.title_date:
        header += f"  —  {week.title_date}"
    print()
    print(c(header, BOLD))
    print(c("Sources: ESPN schedule · 506sports local maps (unofficial)", DIM))
    print(c("★ = 49ers game    ● = on this market's YouTube TV locals", DIM))
    print()

    if not week.maps:
        print(c("⚠ No coverage maps posted on 506sports for this week yet.", RED))
        print(c("  Showing national/package games + full Sunday slate only.\n", DIM))

    # Per-market local lineups (Sunday first, then other national windows)
    for key in ("boise", "spirit_lake"):
        mkt = MARKETS[key]
        local = resolve_market_games(week, key)
        print(c(f"═══ {mkt['label']}  (YouTube TV) ═══", BOLD))
        if not local:
            print(c("  (no local map match yet)", DIM))

        def _is_sunday(g: Game) -> bool:
            if g.kickoff_utc is None:
                return True  # assume regional slate is Sunday
            return g.kickoff_utc.astimezone(mkt["tz"]).weekday() == 6

        sunday = [(g, cs, nl) for g, cs, nl in local if _is_sunday(g)]
        other = [(g, cs, nl) for g, cs, nl in local if not _is_sunday(g)]

        def _print_rows(rows: list[tuple[Game, str, str]]) -> None:
            for g, callsign, net_label in rows:
                star = c("★ ", GOLD + BOLD) if g.is_niners else "  "
                when = fmt_time(g.kickoff_utc, mkt["tz"], mkt["tz_abbr"])
                line = f"{star}{when:<14}  {callsign:<12} {net_label:<6}  {g.matchup}"
                if g.is_niners:
                    print(c(line, GOLD + BOLD))
                else:
                    print(line)

        _print_rows(sunday)
        if other:
            print(c("  — also this week —", DIM))
            _print_rows(other)
        print()

    # Full Sunday (and Sat/Mon national) slate with market availability
    print(c("═══ All week games (market availability) ═══", BOLD))
    # Prefer ESPN list for completeness + times; annotate with map availability
    boise_airing = {g.matchup for g, _, _ in resolve_market_games(week, "boise")}
    spirit_airing = {g.matchup for g, _, _ in resolve_market_games(week, "spirit_lake")}

    # Also build from ESPN for any missing
    rows = []
    for eg in sorted(espn_games, key=lambda x: x["kickoff"]):
        is_niners = eg["away_abbr"] == "SF" or eg["home_abbr"] == "SF"
        matchup = f"{eg['away']} @ {eg['home']}"
        nets = "/".join(eg["networks"]) if eg["networks"] else "?"
        # fuzzy match to 506 matchup names for airing flags
        in_boise = _fuzzy_in(matchup, boise_airing) or _national_net(eg["networks"])
        in_spirit = _fuzzy_in(matchup, spirit_airing) or _national_net(eg["networks"])
        rows.append((eg["kickoff"], matchup, nets, is_niners, in_boise, in_spirit))

    for kick, matchup, nets, is_niners, in_b, in_s in rows:
        star = c("★ ", GOLD + BOLD) if is_niners else "  "
        t_mt = fmt_time(kick, MARKETS["boise"]["tz"], "MT")
        t_ct = fmt_time(kick, MARKETS["spirit_lake"]["tz"], "CT")
        b_flag = c("● Boise", GREEN) if in_b else c("○ Boise", DIM)
        s_flag = c("● Spirit Lake", GREEN) if in_s else c("○ Spirit Lake", DIM)
        line = f"{star}{t_mt} / {t_ct}  {nets:<10}  {matchup}   [{b_flag}  {s_flag}]"
        if is_niners:
            print(c(line, GOLD + BOLD))
        else:
            print(line)
    print()
    print(c("Listings unofficial · subject to change · double-check YouTube TV guide", DIM))
    print()


def _national_net(networks: Iterable[str]) -> bool:
    nat = {"NBC", "ESPN", "ABC", "NFL NETWORK", "NFLN", "PRIME VIDEO", "AMAZON", "NETFLIX", "PEACOCK"}
    return any(n.upper() in nat or any(x in n.upper() for x in ("PRIME", "ESPN", "NBC", "NETFLIX")) for n in networks)


_STOP = {
    "at", "vs", "the", "a", "an", "in", "and", "or",
    "bay", "city", "lake", "los", "angeles", "new", "york",
    "green", "san", "st", "saint", "de", "la", "las",
}


def _team_tokens(s: str) -> set[str]:
    return {t for t in _norm_matchup(s).split() if t not in _STOP and len(t) > 2}


def _fuzzy_in(matchup: str, airing: set[str]) -> bool:
    n = _team_tokens(matchup)
    for a in airing:
        if len(n & _team_tokens(a)) >= 2:
            return True
    return False


# --- CLI ------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Which YouTube TV channels in Boise / Spirit Lake carry which NFL games?"
    )
    p.add_argument("--year", type=int, help="NFL season year (default: current)")
    p.add_argument("--week", type=int, help="Regular-season week (default: current)")
    p.add_argument("--no-color", action="store_true", help="Disable ANSI colors")
    args = p.parse_args(argv)

    global USE_COLOR
    if args.no_color:
        USE_COLOR = False

    try:
        year, week = current_espn_week()
    except Exception as e:
        print(f"Could not detect current NFL week from ESPN: {e}", file=sys.stderr)
        year, week = datetime.now().year, 1

    if args.year:
        year = args.year
    if args.week:
        week = args.week

    print(c(f"Loading Week {week}, {year}…", DIM))

    try:
        espn_games = espn_sunday_games(year, week)
    except Exception as e:
        print(f"ESPN schedule fetch failed: {e}", file=sys.stderr)
        espn_games = []

    try:
        week_data = load_week(year, week)
    except Exception as e:
        print(f"506sports fetch/parse failed: {e}", file=sys.stderr)
        return 1

    attach_espn_times(week_data, espn_games)
    print_report(week_data, espn_games)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
