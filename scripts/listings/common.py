import html
import http.client
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


PAUSE = 1.25
READ_TIMEOUT = 10
UA = "ChannelFinder/1.0 (personal local-TV lookup; one request at a time)"

SITEMAP = "https://www.tvpassport.com/sitemap.stations.xml"

SITE_ID = re.compile(r"titantvguide\.com/\?siteid=(\d+)", re.I)
LISTING_LINK = re.compile(r"tv-?listings|/listings\b|tvguide", re.I)
ITEM = re.compile(
    r"<div\b([^>]*\blist-group-item\b[^>]*)>",
    re.I,
)

SKIP_HOSTS = (
    "tvpassport.",
    "tvmedia.",
    "google.",
    "facebook.",
    "amazon.",
    "doubleclick.",
    "googletagmanager.",
)

LEAGUE_KEYS = {
    "nfl": "football",
    "mlb": "baseball",
    "nba": "basketball",
    "nhl": "hockey",
    "wnba": "basketball"
}

NETWORKS = ("FOX", "CBS", "NBC", "ABC")


def scoreboard(week=None, league="nfl"):
    url = (
        "https://site.web.api.espn.com/apis/site/v2/"
        f"sports/{LEAGUE_KEYS[league]}/{league}/scoreboard"
        "?seasontype=2"
    )

    if week is not None:
        url += f"&week={week}"
    print(url)

    return json.loads(get(url))


def kickoffs(payload):
    stamps = []

    for event in payload.get("events") or []:
        raw = event.get("date") or ""

        try:
            stamps.append(
                datetime.fromisoformat(
                    raw.replace("Z", "+00:00")
                )
            )
        except ValueError:
            continue

    return stamps


def dates_for(payload):
    dates = {
        network: set()
        for network in NETWORKS
    }

    pacific = ZoneInfo("America/Los_Angeles")

    for event in payload.get("events") or []:
        raw = event.get("date") or ""

        try:
            kickoff = datetime.fromisoformat(
                raw.replace("Z", "+00:00")
            )
        except ValueError:
            continue

        day = kickoff.astimezone(pacific).date().isoformat()

        names = set()

        for competition in event.get("competitions") or []:
            for broadcast in competition.get("broadcasts") or []:
                for name in broadcast.get("names") or []:
                    names.add(name.upper())

        for network in NETWORKS:
            if any(network in name for name in names):
                dates[network].add(day)

    return {
        network: sorted(days)
        for network, days in dates.items()
    }


def espn_week(league):
    """Get ESPN's current regular-season week.

    If every game in that week has already kicked off, use the next
    available week instead.
    """

    payload = scoreboard(league=league)

    week = (payload.get("week") or {}).get("number")
    played = kickoffs(payload)

    if (
        isinstance(week, int)
        and played
        and max(played) < datetime.now(timezone.utc)
    ):
        next_week = week + 1

        if next_week <= 18:
            follow = scoreboard(next_week)

            if follow.get("events"):
                print(
                    f"Week {week} is over. "
                    f"Building week {next_week}.",
                    flush=True,
                )

                payload = follow
                week = (
                    (follow.get("week") or {}).get("number")
                    or next_week
                )

    return week, payload


def titan_rows(payload, league):
    rows = []

    body = payload.get("Json")
    channels = (
        body.get("Channels")
        if isinstance(body, dict)
        else None
    )

    if not isinstance(channels, list):
        return rows

    for channel in channels:
        days = (
            channel.get("Days")
            if isinstance(channel, dict)
            else None
        )

        if not isinstance(days, list):
            continue

        for day in days:
            shows = (
                day.get("Shows")
                if isinstance(day, dict)
                else None
            )

            if not isinstance(shows, list):
                continue

            for show in shows:
                if not isinstance(show, dict):
                    continue

                title = titan_text(show.get("Title"))
                episode = titan_text(
                    show.get("EpisodeTitle")
                )

                text = f"{title} {episode}".lower()

                if league not in text and LEAGUE_KEYS[league] not in text:
                    continue

                matchup = episode

                if (
                    " at " not in matchup.lower()
                    and " vs " not in matchup.lower()
                    and "@" not in matchup
                ):
                    if ":" in title:
                        matchup = title.split(":", 1)[1].strip()
                    else:
                        matchup = title

                matchup = re.sub(
                    r"\s*@\s*",
                    " at ",
                    matchup,
                )

                if (
                    " at " not in matchup.lower()
                    and " vs " not in matchup.lower()
                ):
                    continue

                if "college" in title.lower():
                    continue

                rows.append(
                    {
                        "start": str(
                            show.get("StartTime") or ""
                        ),
                        "show": title,
                        "episode": matchup,
                    }
                )

    return rows



def polite_get(url):
    """Fetch one page. A bad host returns (url, '') so the build can keep going."""

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json",
        },
    )

    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=READ_TIMEOUT) as response:
                try:
                    body = response.read()
                except http.client.IncompleteRead as error:
                    partial = error.partial or b""

                    if partial:
                        print(
                            f"Warning: truncated response from {url}. "
                            "Using the partial page.",
                            flush=True,
                        )
                        return response.geturl(), partial.decode(
                            "utf-8", "replace"
                        )

                    print(
                        f"Warning: truncated response from {url}. "
                        "Skipping this station site.",
                        flush=True,
                    )
                    return url, ""

                return response.geturl(), body.decode("utf-8", "replace")

        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt == 0:
                print(
                    f"Warning: HTTP 429 from {url}. "
                    "Pausing, then retrying once.",
                    flush=True,
                )
                time.sleep(20)
                continue

            print(
                f"Warning: HTTP {error.code} from {url}. "
                "Skipping this station site.",
                flush=True,
            )
            return url, ""

        except http.client.IncompleteRead as error:
            partial = error.partial or b""

            if partial:
                print(
                    f"Warning: truncated response from {url}. "
                    "Using the partial page.",
                    flush=True,
                )
                return url, partial.decode("utf-8", "replace")

            if attempt == 0:
                time.sleep(1)
                continue

            print(
                f"Warning: truncated response from {url}. "
                "Skipping this station site.",
                flush=True,
            )
            return url, ""

        except (
            urllib.error.URLError,
            http.client.HTTPException,
            ssl.SSLError,
            TimeoutError,
            ConnectionError,
            OSError,
        ) as error:
            if attempt == 0:
                time.sleep(1)
                continue

            print(
                f"Warning: could not read {url}: {error}. "
                "Skipping this station site.",
                flush=True,
            )
            return url, ""

        except Exception as error:
            print(
                f"Warning: could not read {url}: {error}. "
                "Skipping this station site.",
                flush=True,
            )
            return url, ""

    return url, ""


def get(url):
    print(url)

    final, body = polite_get(url)

    if not body:
        raise urllib.error.URLError(f"empty response from {url}")

    return body


def attr(blob, name):
    found = re.search(f'data-{name}="([^"]*)"', blob)
    return html.unescape(found.group(1)) if found else ""


def station_index(sitemap, networks):
    rows = []

    for url in re.findall(r"<loc>([^<]+)</loc>", sitemap):
        slug = url.rstrip("/").split("/")[-2]
        parts = slug.split("-")

        if len(parts) < 3:
            continue

        network = parts[0].upper()
        callsign = parts[1].upper()

        if network not in networks:
            continue

        if not re.fullmatch(r"[A-Z]{3,5}\d?", callsign):
            continue

        rank = 0 if "-hd" in slug else 1

        rows.append(
            (
                network,
                callsign,
                rank,
                url.split("?")[0].rstrip("/"),
            )
        )

    return rows


def lookup_station(index, network, callsign):
    exact = [
        row
        for row in index
        if row[0] == network and row[1] == callsign
    ]

    pool = exact or [
        row
        for row in index
        if row[0] == network
        and row[1].startswith(callsign)
        and row[1][len(callsign):].isdigit()
    ]

    if not pool:
        return None

    pool.sort(key=lambda row: row[2])

    return pool[0][3]


def open_station(url):
    final, body = polite_get(url)

    if body or not url.startswith("http://"):
        return final, body

    return polite_get("https://" + url[len("http://"):])


def pause():
    time.sleep(PAUSE)


def official_site(page):
    match = re.search(
        r'href="(https?://[^"]+)"[^>]*>\s*Visit website\s*</a>',
        page,
        re.I,
    )

    if not match:
        return ""

    url = html.unescape(match.group(1)).strip()
    host = urllib.parse.urlparse(url).netloc.lower()

    if not host or any(bad in host for bad in SKIP_HOSTS):
        return ""

    return url


def titan_text(value):
    if isinstance(value, str):
        return value

    if isinstance(value, list):
        parts = []

        for item in value:
            if isinstance(item, dict) and item.get("Text"):
                parts.append(str(item["Text"]))
            elif isinstance(item, str):
                parts.append(item)

        return " ".join(parts)

    return ""


def channel_key(channel, wanted, networks):
    callsign = re.match(
        r"[A-Z]+",
        str(channel.get("CallSign") or "").upper(),
    )

    network = str(channel.get("Network") or "").upper()

    if not callsign:
        return ""

    callsign = callsign.group(0)

    for name in networks:
        if name in re.findall(r"[A-Z]+", network):
            if f"{callsign}|{name}" in wanted:
                return f"{callsign}|{name}"

    return ""


def find_site_id(page):
    found = SITE_ID.search(page)
    return found.group(1) if found else ""


def listings_link(page, page_url):
    host = urllib.parse.urlparse(page_url).netloc.lower()

    for href in re.findall(r'href="([^"]+)"', page, re.I):
        if not LISTING_LINK.search(href):
            continue

        absolute = urllib.parse.urljoin(
            page_url,
            html.unescape(href),
        )

        if urllib.parse.urlparse(absolute).netloc.lower() != host:
            continue

        return absolute.split("#")[0]

    return ""


def load_json(path):
    if not path.exists():
        return None

    return json.loads(path.read_text())


def enrich_from_stations(
    wanted,
    dates,
    games,
    networks,
    cache,
    league
):
    """Prefer a station's own guide. Keep public-guide rows when it has none."""

    sites = {}
    guides = {}
    station_rows = {}
    used_guides = {}

    cache.mkdir(parents=True, exist_ok=True)

    print(
        "Looking up each station website, then its own listings…",
        flush=True,
    )

    for index, (key, (guide_url, _network)) in enumerate(
        wanted.items(),
        start=1,
    ):
        station_id = guide_url.rstrip("/").split("/")[-1]
        cache_path = cache / f"site-{station_id}.json"
        cached = load_json(cache_path)

        if cached is None:
            try:
                _final, page = polite_get(guide_url)

            except urllib.error.HTTPError as error:
                if error.code == 429:
                    print(
                        f"HTTP 429 reading {key}. "
                        "Stopping so we don't hammer the site.",
                        flush=True,
                    )
                    break

                print(
                    f"No page for {key} ({error.code}).",
                    flush=True,
                )

                cached = {"website": ""}
                cache_path.write_text(json.dumps(cached))
                pause()

            except (urllib.error.URLError, TimeoutError) as error:
                print(
                    f"Could not read {key}: {error}.",
                    flush=True,
                )

                cached = {"website": ""}
                cache_path.write_text(json.dumps(cached))
                pause()

            else:
                cached = {"website": official_site(page)}
                cache_path.write_text(json.dumps(cached))
                pause()

                if index % 25 == 0:
                    print(
                        f"Station websites {index}/{len(wanted)}…",
                        flush=True,
                    )

        website = str(cached.get("website") or "")

        if website:
            sites[key] = website

    hosts = {}

    for key, website in sites.items():
        host = (
            urllib.parse.urlparse(website)
            .netloc
            .lower()
            .removeprefix("www.")
        )

        hosts.setdefault(host, website)

    print(
        f"{len(hosts)} station websites. "
        "Checking which ones publish a guide…",
        flush=True,
    )

    for index, (host, website) in enumerate(hosts.items(), start=1):
        cache_path = cache / (
            f"guide-{re.sub('[^a-z0-9.-]', '', host)}.json"
        )

        cached = load_json(cache_path)

        if cached is None:
            page_url = website
            site_id = ""
            final = ""
            page = ""

            try:
                final, page = open_station(website)

            except urllib.error.HTTPError as error:
                if error.code == 429:
                    print(
                        f"HTTP 429 on {website}. "
                        "Pausing, then moving on.",
                        flush=True,
                    )
                    time.sleep(20)
                else:
                    print(
                        f"No guide page for {host} ({error.code}).",
                        flush=True,
                    )

            except Exception as error:
                print(
                    f"Could not read {website}: {error}.",
                    flush=True,
                )

            if page:
                pause()

                site_id = find_site_id(page)
                page_url = final

                if not site_id:
                    link = listings_link(page, final)

                    if link and link.rstrip("/") != final.rstrip("/"):
                        try:
                            final, page = polite_get(link)
                            pause()

                            site_id = find_site_id(page)

                            if site_id:
                                page_url = final

                        except urllib.error.HTTPError as error:
                            if error.code == 429:
                                print(
                                    f"HTTP 429 on {link}. "
                                    "Pausing, then moving on.",
                                    flush=True,
                                )
                                time.sleep(20)

                        except Exception as error:
                            print(
                                f"Could not read {link}: {error}.",
                                flush=True,
                            )

            cached = {
                "siteid": site_id,
                "page": page_url if site_id else final or website,
                "opened": final,
                "lineup": "",
                "channels": {},
            }

            if site_id:
                try:
                    _final, lineup_page = polite_get(
                        f"https://www.titantvguide.com/data/lineups/{site_id}"
                    )

                    pause()

                    lineup = json.loads(lineup_page)
                    lineup_id = ""

                    entries = (
                        lineup.get("Json")
                        if isinstance(lineup, dict)
                        else None
                    )

                    if isinstance(entries, list) and entries:
                        lineup_id = str(
                            entries[0].get("LineupId") or ""
                        )

                    cached["lineup"] = lineup_id

                    if lineup_id:
                        _final, channel_page = polite_get(
                            f"https://www.titantvguide.com/data/channels/"
                            f"{site_id}/{lineup_id}"
                        )

                        pause()

                        channels = json.loads(channel_page)
                        body = (
                            channels.get("Json")
                            if isinstance(channels, dict)
                            else None
                        )

                        found = {}

                        raw_channels = (
                            body.get("Channels")
                            if isinstance(body, dict)
                            else None
                        )

                        if isinstance(raw_channels, list):
                            for channel in raw_channels:
                                if not isinstance(channel, dict):
                                    continue

                                matched = channel_key(
                                    channel,
                                    set(wanted),
                                    networks,
                                )

                                if matched and matched not in found:
                                    found[matched] = int(
                                        channel.get("ChannelIndex") or 0
                                    )

                        cached["channels"] = found

                except (
                    urllib.error.URLError,
                    json.JSONDecodeError,
                    ValueError,
                ) as error:
                    print(
                        f"Guide for {host} did not load ({error}). "
                        "Using the fallback for that site.",
                        flush=True,
                    )
                    cached["siteid"] = ""

            cache_path.write_text(json.dumps(cached))

            if index % 20 == 0:
                print(
                    f"Checked {index}/{len(hosts)} websites…",
                    flush=True,
                )

        guides[host] = cached

    for key, website in list(sites.items()):
        host = (
            urllib.parse.urlparse(website)
            .netloc
            .lower()
            .removeprefix("www.")
        )

        guide = guides.get(host) or {}
        opened = str(guide.get("opened") or "")

        opened_host = (
            urllib.parse.urlparse(opened)
            .netloc
            .lower()
            .removeprefix("www.")
            if opened
            else ""
        )

        same = bool(opened_host) and (
            host in opened_host or opened_host in host
        )

        if guide.get("siteid") and opened and same:
            sites[key] = opened

        elif opened and not same and not guide.get("siteid"):
            sites.pop(key, None)

        elif same:
            sites[key] = opened

    for host, guide in guides.items():
        page = str(guide.get("page") or "")
        channels = (
            guide.get("channels")
            if isinstance(guide.get("channels"), dict)
            else {}
        )

        site_id = str(guide.get("siteid") or "")
        lineup_id = str(guide.get("lineup") or "")

        if not site_id or not lineup_id:
            continue

        for key, channel_index in channels.items():
            if key not in wanted or not channel_index:
                continue

            network = key.split("|", 1)[1]
            rows = []
            loaded = True

            for day in dates.get(network, []):
                day_path = (
                    cache
                    / f"titan-{site_id}-{channel_index}-{day}.json"
                )

                if day_path.exists():
                    rows.extend(
                        json.loads(day_path.read_text())
                    )
                    continue

                stamp = day.replace("-", "") + "0000"

                url = (
                    f"https://www.titantvguide.com/data/events/"
                    f"{site_id}/{lineup_id}/{stamp}/1440/"
                    f"{channel_index}/1"
                )

                try:
                    _final, body = polite_get(url)

                except (urllib.error.URLError, TimeoutError) as error:
                    print(
                        f"Could not read {key} on {day} ({error}).",
                        flush=True,
                    )
                    loaded = False
                    break

                try:
                    parsed = titan_rows(json.loads(body), league)

                except json.JSONDecodeError:
                    print(
                        f"Could not read {key} on {day}.",
                        flush=True,
                    )
                    loaded = False
                    break

                day_path.write_text(json.dumps(parsed))
                rows.extend(parsed)
                pause()

            if not loaded:
                continue

            own = key.split("|", 1)[0].lower() in host
            previous = used_guides.get(key)

            if previous and previous != host and not own:
                continue

            if previous and key.split("|", 1)[0].lower() in previous:
                if not own:
                    continue

            station_rows[key] = rows
            used_guides[key] = host

            if page:
                sites[key] = page

    replaced = 0

    for key, rows in station_rows.items():
        games[key] = rows
        replaced += 1

    print(
        f"{replaced} stations came from their own guide. "
        "The rest stay on the public guide.",
        flush=True,
    )

    return sites