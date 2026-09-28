#!/usr/bin/env python3
"""Build the place list and local-station markets from free public sources.

Places: GeoNames postal file (CC BY 4.0).
Stations: RabbitEars market pages, which cite FCC network data.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PLACES_OUT = ROOT / "web" / "public" / "places.txt"
MARKETS_OUT = ROOT / "web" / "public" / "data" / "markets.json"
UA = "ChannelFinder/1.0 (sports-finder local listings; public data mirror)"
GEONAMES = "https://download.geonames.org/export/zip/US.zip"
MARKET_LIST = "https://www.rabbitears.info/market.php?request=marketlist"

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
    "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
NAME_TO_ST = {name.lower(): abbr for abbr, name in STATES.items()}
MAJOR = {"FOX", "CBS", "NBC", "ABC"}
ROW = re.compile(
    r"<td>(\d+)</td>\s*<td[^>]*>\s*(\d+)[\s\S]*?</td>\s*"
    r"<td><a href=\"market.php\?request=station_search&callsign=\d+"
    r"[\s\S]*?<nobr>([A-Z0-9\-]+)</nobr>"
    r"[\s\S]*?<nobr>([A-Z][^<]{0,40})</nobr>"
    r"[\s\S]*?<acronym title='This network data comes from the FCC[^']*'>([^<]+)</acronym>",
    re.I,
)


def fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=60) as response:
        return response.read().decode("utf-8", "replace")


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=120) as response:
        return response.read()


def build_places() -> dict[tuple[str, str], tuple[float, float]]:
    raw = fetch_bytes(GEONAMES)
    zf = zipfile.ZipFile(io.BytesIO(raw))
    name = next(n for n in zf.namelist() if n.upper().endswith("US.TXT"))
    best: dict[str, tuple[int, str, str, float, float]] = {}
    for line in zf.read(name).decode("utf-8", "replace").splitlines():
        parts = line.split("\t")
        if len(parts) < 11 or parts[0] != "US":
            continue
        zip_code, city, st = parts[1], parts[2].strip(), parts[4].strip()
        if st not in STATES or not city or not zip_code.isdigit():
            continue
        try:
            lat, lon = float(parts[9]), float(parts[10])
            accuracy = int(parts[11]) if len(parts) > 11 and parts[11].isdigit() else 9
        except ValueError:
            continue
        current = best.get(zip_code)
        if current is None or accuracy < current[0]:
            best[zip_code] = (accuracy, city, st, lat, lon)

    PLACES_OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted(best.items(), key=lambda item: (item[1][1].lower(), item[1][2], item[0]))
    with PLACES_OUT.open("w", encoding="utf-8") as handle:
        for zip_code, (_accuracy, city, st, lat, lon) in rows:
            handle.write(f"{city}\t{st}\t{zip_code}\t{lat:.4f}\t{lon:.4f}\n")
    print(f"Wrote {len(rows)} places to {PLACES_OUT}")

    centroids: dict[tuple[str, str], tuple[float, float]] = {}
    buckets: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for _zip, (_accuracy, city, st, lat, lon) in rows:
        buckets.setdefault((city.lower(), st), []).append((lat, lon))
    for key, points in buckets.items():
        centroids[key] = (
            sum(lat for lat, _lon in points) / len(points),
            sum(lon for _lat, lon in points) / len(points),
        )
    return centroids


def geocode(label: str, centroids: dict[tuple[str, str], tuple[float, float]]) -> tuple[float, float] | None:
    if "," not in label:
        return None
    city, state_name = [part.strip() for part in label.split(",", 1)]
    city = city.split("/")[0].strip()
    st = NAME_TO_ST.get(state_name.lower())
    if not st:
        return None
    found = centroids.get((city.lower(), st))
    if found is None and city.lower().endswith(" city"):
        found = centroids.get((city[:-5].strip().lower(), st))
    return found


def parse_stations(html: str) -> list[dict]:
    found: dict[str, dict] = {}
    rows = []
    for part in re.split(r"<tr\b[^>]*>", html):
        head = part.split("</tr>", 1)[0]
        match = ROW.search(head)
        if match:
            rows.append(match.groups())
    for virt, _rf, call, city, network in rows:
        if re.search(r"\d", call) or re.search(r"-(LD|CD|CA|D)$", call):
            continue
        short = re.sub(r"-(TV|DT)$", "", call)
        for token in re.findall(r"FOX|CBS|NBC|ABC", network.upper()):
            current = found.get(token)
            if current is None or int(virt) < int(current["channel"]):
                found[token] = {
                    "callsign": short,
                    "network": token,
                    "channel": virt,
                    "city": city.title(),
                }
    order = {"CBS": 0, "NBC": 1, "ABC": 2, "FOX": 3}
    return sorted(found.values(), key=lambda station: order[station["network"]])


def market_rows() -> list[tuple[str, str, int]]:
    html = fetch(MARKET_LIST)
    rows = re.findall(
        r"market=(\d+)'[^>]*>(\d+)</a></td><td[^>]*>([^<]+)</td><td>([\d,]+)</td>",
        html,
    )
    kept = []
    for market_id, _rank, name, pop_text in rows:
        pop = int(pop_text.replace(",", ""))
        if pop >= 80_000:
            kept.append((market_id, name.strip(), pop))
    return kept


def scrape_markets(centroids: dict[tuple[str, str], tuple[float, float]]) -> None:
    rows = market_rows()
    print(f"Scraping {len(rows)} RabbitEars markets")

    def one(row: tuple[str, str, int]) -> dict | None:
        market_id, name, pop = row
        try:
            html = fetch(f"https://www.rabbitears.info/market.php?mktid={market_id}")
        except Exception as exc:
            print(f"  skip {name}: {exc}")
            return None
        stations = parse_stations(html)
        point = geocode(name, centroids)
        if not stations or point is None:
            print(f"  skip {name}: stations={len(stations)} coords={point is not None}")
            return None
        city, state_name = [part.strip() for part in name.split(",", 1)]
        return {
            "id": int(market_id),
            "name": city.split("/")[0].strip(),
            "state": NAME_TO_ST.get(state_name.lower(), ""),
            "pop": pop,
            "lat": round(point[0], 4),
            "lon": round(point[1], 4),
            "stations": stations,
        }

    markets: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(one, row) for row in rows]
        for future in as_completed(futures):
            item = future.result()
            if item:
                markets.append(item)
    markets.sort(key=lambda market: market["name"])
    MARKETS_OUT.parent.mkdir(parents=True, exist_ok=True)
    MARKETS_OUT.write_text(json.dumps(markets, separators=(",", ":")))
    boise = next((market for market in markets if market["id"] == 138), None)
    print(f"Wrote {len(markets)} markets")
    print("Boise", json.dumps(boise, indent=2) if boise else "MISSING")


def main() -> None:
    centroids = build_places()
    scrape_markets(centroids)


if __name__ == "__main__":
    main()
