#!/usr/bin/env python3
"""Export the NFL coverage week as JSON + map images for the web app.

The React app is static (GitHub Pages), so it cannot scrape 506sports itself.
This script pulls the same sources as sunday_tv.py and writes:

    web/public/data/week.json
    web/public/data/maps/*.png
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sunday_tv import (
    CACHE_DIR,
    SECTION_RE,
    WeekData,
    _normalize_section,
    attach_espn_times,
    current_espn_week,
    espn_sunday_games,
    load_week,
    nearest_swatch,
    parse_506_page,
    scraper,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "public" / "data"


def _load_cached(year: int, week: int) -> tuple[WeekData, str]:
    html_path = CACHE_DIR / f"506_{year}_w{week:02d}.html"
    if not html_path.exists():
        raise FileNotFoundError(f"No cached 506 page at {html_path}")
    html = html_path.read_text(encoding="utf-8", errors="replace")
    return parse_506_page(html, year, week, scraper()), html


def _clean_matchup(raw: str) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", BeautifulSoup(raw, "lxml").get_text(" ", strip=True)).strip()
    note = ""
    m = re.search(r"\(([^)]*)\)\s*$", text)
    if m:
        note = m.group(1).strip()
        text = text[: m.start()].strip()
    return text, note


def _text(fragment: str) -> str:
    soup = BeautifulSoup(fragment, "lxml")
    for tag in soup.find_all("font", attrs={"size": "1"}):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def _announcers(html: str) -> dict[str, str]:
    """Matchup text (as on the page, notes included) -> announcer string."""
    found: dict[str, str] = {}
    patterns = (
        r'id="cmatchup">(.*?)</div>.*?id="canncrs">(.*?)</div>',
        r"id=['\"]matchup['\"]>(.*?)</div>\s*<div id=['\"]anncrs['\"]>(.*?)</div>",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, html, flags=re.I | re.S):
            label = _text(match.group(1))
            names = _text(match.group(2))
            if label and names:
                found[label] = names
    return found


def _outlying(html: str, palette: dict[int, tuple[int, int, int]]) -> dict[str, dict[str, int]]:
    """Alaska / Hawaii aren't on the CONUS map; 506 prints their color next to the name."""
    out: dict[str, dict[str, int]] = {"AK": {}, "HI": {}}
    parts = re.split(
        r'<b><font size="5">([^<]+)</font></b>|<p><b><font size="5">([^<]+)</font></b></p>',
        html,
        flags=re.I,
    )
    i = 1
    while i < len(parts):
        title = (parts[i] or parts[i + 1] or "").strip()
        chunk = parts[i + 2] if i + 2 < len(parts) else ""
        i += 3
        if not SECTION_RE.search(title) or title.upper().startswith("NATIONAL"):
            continue
        net, slot = _normalize_section(title)
        key = f"{net}|{slot}"
        for state, label in (("AK", "Alaska"), ("HI", "Hawaii")):
            m = re.search(
                rf'<font color="#([0-9A-Fa-f]{{6}})">[^<]*</font>\s*{label}',
                chunk,
                flags=re.I,
            )
            if not m:
                continue
            hexcol = m.group(1)
            rgb = tuple(int(hexcol[j : j + 2], 16) for j in (0, 2, 4))
            sid = nearest_swatch(rgb, palette, thresh=80.0)
            if sid is not None:
                out[state][key] = sid
    return out


def _week_html(year: int, week: int, cached: bool) -> tuple[WeekData, str]:
    if cached:
        return _load_cached(year, week)
    week_data = load_week(year, week)
    html = (CACHE_DIR / f"506_{year}_w{week:02d}.html").read_text(encoding="utf-8", errors="replace")
    return week_data, html


def export(year: int, week: int, out_dir: Path, cached: bool) -> None:
    week_data, html = _week_html(year, week, cached)
    try:
        espn = espn_sunday_games(year, week)
    except Exception as exc:
        print(f"ESPN schedule fetch failed: {exc}", file=sys.stderr)
        espn = []
    attach_espn_times(week_data, espn)
    voices = _announcers(html)
    outlying = _outlying(html, week_data.palette)

    maps_dir = out_dir / "maps"
    if maps_dir.exists():
        shutil.rmtree(maps_dir)
    maps_dir.mkdir(parents=True, exist_ok=True)

    maps = []
    for key, path in week_data.maps.items():
        net, slot = key.split("|", 1)
        dest_name = path.name
        shutil.copy2(path, maps_dir / dest_name)
        maps.append({"network": net, "slot": slot, "file": f"maps/{dest_name}"})

    games = []
    for game in week_data.games:
        label, note = _clean_matchup(game.matchup)
        games.append(
            {
                "matchup": label,
                "rawMatchup": re.sub(r"\s+", " ", game.matchup).strip(),
                "annotation": note,
                "network": game.network,
                "slot": game.window,
                "swatch": game.swatch,
                "national": game.national,
                "announcers": voices.get(re.sub(r"\s+", " ", game.matchup).strip(), ""),
                "kickoff": game.kickoff_utc.isoformat() if game.kickoff_utc else None,
                "away": game.away,
                "home": game.home,
            }
        )

    payload = {
        "year": week_data.year,
        "week": week_data.week,
        "titleDate": week_data.title_date,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "palette": {str(k): list(v) for k, v in sorted(week_data.palette.items())},
        "maps": maps,
        "outlying": outlying,
        "games": games,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "week.json"
    tmp = dest.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2))
    tmp.replace(dest)
    print(f"Wrote {dest} ({len(games)} games, {len(maps)} maps)")
    print(f"Outlying markets: {outlying}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Export NFL coverage data for the web app")
    p.add_argument("--year", type=int, help="NFL season year (default: current)")
    p.add_argument("--week", type=int, help="Regular-season week (default: current)")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output directory")
    p.add_argument("--cached", action="store_true", help="Use the cached 506 page, skip the live fetch")
    args = p.parse_args(argv)

    try:
        year, week = current_espn_week()
    except Exception as exc:
        print(f"Could not detect the current NFL week: {exc}", file=sys.stderr)
        year, week = datetime.now().year, 1
    if args.year:
        year = args.year
    if args.week:
        week = args.week

    try:
        export(year, week, args.out, args.cached)
    except Exception as exc:
        print(f"Export failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
