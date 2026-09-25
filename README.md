# Channel Finder

See which games are on where you are. Enter a US zip code, pick a sport, and get the slate in local time. For the NFL, FOX and CBS follow the local market; national and streaming games are listed either way.

The site is a static React app meant for [GitHub Pages](https://rpacheco-1996.github.io/sports-finder/). The Python CLI in `chanel-finder/` is the original two-market checker and the script that exports coverage maps.

## Web app

```bash
cd chanel-finder
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python export_web.py          # current NFL week → web/public/data

cd ../web
npm install
npm run dev
```

`npm run build` writes `web/dist`.

Set a Patreon (or any support) link in `web/src/config.ts`.

## GitHub Pages

Pages publishes the `main` branch root. `npm run build` writes that site (`index.html` and `assets/`). `.nojekyll` keeps Jekyll from turning this repo into a README page.

The live app is [https://rpacheco-1996.github.io/sports-finder/](https://rpacheco-1996.github.io/sports-finder/).

Listings are unofficial. FOX and CBS markets come from [506sports](https://506sports.com) coverage maps; kickoff times and other sports come from ESPN.

## CLI

```bash
cd chanel-finder
source .venv/bin/activate
python sunday_tv.py
python sunday_tv.py --week 3
```

Prints the Boise and Spirit Lake YouTube TV locals for the week, with 49ers games highlighted.
