import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from common import (
    SITEMAP,
    enrich_from_stations,
    get,
    station_index,
    espn_week,
    dates_for,
)


ROOT = Path(__file__).resolve().parents[2]
LEAGUE = sys.argv[1]
OUT = ROOT / "public" / "listings" / f"{LEAGUE}.json"
CACHE = ROOT / "scripts" / "cache" / "listings"

NETWORKS = ("FOX", "CBS", "NBC", "ABC")


def main():
    week, games = espn_week(LEAGUE)

    dates = dates_for(games)

    sitemap = get(SITEMAP)
    stations = station_index(sitemap, NETWORKS)

    wanted = {}

    for network, callsign, rank, url in stations:
        key = f"{callsign}|{network}"

        if key not in wanted or rank < wanted[key][1]:
            wanted[key] = (url, rank, network)

    wanted = {
        key: (value[0], value[2])
        for key, value in wanted.items()
    }

    sites = enrich_from_stations(
        wanted,
        dates,
        games,
        NETWORKS,
        CACHE,
        LEAGUE,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)

    output = {
        "league": LEAGUE,
        "season": datetime.now(
            ZoneInfo("America/Denver")
        ).year,
        "week": week,
        "games": games,
        "sites": sites,
    }

    OUT.write_text(
        json.dumps(output, indent=2)
    )


if __name__ == "__main__":
    main()