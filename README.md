# Channel Finder

See which games are on where you are. Enter a US zip code, pick a sport, and get the slate in local time. For the NFL, FOX and CBS follow the local market; national and streaming games are listed either way.

The site is a static React app meant for [GitHub Pages](https://rpacheco-1996.github.io/sports-finder/). The Python CLI in `chanel-finder/` is the original two-market checker. Local NFL games on the site come from station listings, not coverage maps.

## Web app

```bash
cd chanel-finder
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build_listings.py     # current NFL week → web/public/data/listings.json

cd ../web
npm install
npm run dev
```

`npm run build` writes the site onto the repository root (`index.html`, `assets/`, `data/`, `places.txt`) and adds `.nojekyll`. GitHub Pages publishes that root from `main`.

`.github/workflows/weekly-build.yml` runs every Tuesday at 08:00 UTC, and whenever you start it by hand. It builds the current NFL week (or the next one if that week has already kicked off), then commits the built site back to `main`. Pages publishes that commit. The run keeps the station-page cache so it only fetches dates it does not already have. If `main` is protected, allow the GitHub Actions bot to push.

```bash
python build_listings.py --week 4
```

## GitHub Pages

Pages publishes the `main` branch root. `npm run build` writes that site (`index.html` and `assets/`). `.nojekyll` keeps Jekyll from turning this repo into a README page.

The live app is [https://specialpancakes.com/](https://specialpancakes.com/).

`build_listings.py` reads each station’s own listings page first, one request at a time, and caches the page. TV Passport is only used when that station doesn’t publish a guide. The time on a local game links to the station’s website. Kickoff times and other sports come from ESPN. Listings are unofficial.

Set a Patreon (or any support) link in `web/src/config.ts`.

## CLI

```bash
cd chanel-finder
source .venv/bin/activate
python sunday_tv.py
python sunday_tv.py --week 3
```

Prints the Boise and Spirit Lake YouTube TV locals for the week, with 49ers games highlighted.
