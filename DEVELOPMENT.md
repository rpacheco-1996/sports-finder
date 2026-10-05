# Special Pancakes — developer guide

This is the guide for working on the site. The product overview is in `README.md`.

Special Pancakes is a static Vite app: plain HTML, CSS, and JavaScript, plus a Python script that builds NFL station listings. There is no React app, no backend, and no database. GitHub Pages is meant to serve the root of `main`.

## Project architecture

```text
src/                         application source
public/                      static data, brand files, and scraper output
scripts/                     scrape, sitemap, and publish tooling
dist/                        generated intermediate build (gitignored)
repository root              generated GitHub Pages payload
.github/workflows/build-and-deploy.yml
                             weekly scrape, build, and publish
```

Edit these:

- `src/` for application behavior, layout, SEO, and theme
- `public/` for city data, market data, the logo, the favicon, and `CNAME`
- `scripts/` when changing the scraper, the sitemap, or how the root is published
- `.github/workflows/build-and-deploy.yml` only when changing the weekly production job

Do not hand-edit these. The next production build overwrites them:

- `dist/`
- root `index.html`
- root `assets/`
- root `listings.json`
- root `places.txt`
- root `data/markets.json`
- root `sitemap.xml`
- root `robots.txt`
- root `logo.png`
- root `favicon.ico`
- root `CNAME`
- `.nojekyll`

`public/listings.json` is the scraper output and the file the dev server serves. The root `listings.json` is the published copy of that file. Python writes only the `public/` copy.

`specialpancakes-logo.png` at the repository root is a spare copy of the brand image. The site uses `/logo.png`.

## Local development

```bash
npm ci
npm run dev
```

`npm ci` installs the lockfile (`vite` is the only dependency).

`npm run dev` starts Vite. The config root is `src/`, the public directory is `public/`, and the port is `5173`. Open http://127.0.0.1:5173/ . That server loads `src/index.html` and `src/js/app.js`. It does not use the root `index.html`.

`npm run build` is the production build, described below. It does write the repository root. Use it when you intend to publish, not for ordinary editing.

`npm run build:sitemap` only rewrites `public/sitemap.xml` and `public/robots.txt`.

`npm run preview` serves `dist/` after a build. It is not the dev server.

## Production build

```text
src + public
    ↓
scripts/generateSitemap.js
    ↓
Vite
    ↓
dist
    ↓
scripts/publish.mjs
    ↓
repository root
```

`npm run build` runs those three steps. Vite empties `dist/` first, bundles `src/`, and copies `public/` into `dist/`. `scripts/publish.mjs` deletes root `assets/`, then copies `dist/` onto the repository root and writes `.nojekyll`.

Root `index.html` points at `/assets/index-<hash>.js`. `src/index.html` points at `./js/app.js`. If those look the same, something was edited in the wrong place.

After a production build, the root `listings.json`, `places.txt`, `data/markets.json`, `sitemap.xml`, `robots.txt`, `logo.png`, `favicon.ico`, and `CNAME` should match the files in `public/`.

## Data sources

```text
public/places.txt
    ↓
location selection

public/data/markets.json
    ↓
TV market selection

ESPN scoreboard API
    ↓
game slate

public/listings.json
    ↓
NFL local station classification
```

The browser fetches all three static files. ESPN is requested from the browser at `https://site.web.api.espn.com/apis/site/v2/sports/{path}/scoreboard`.

ESPN supplies the slate for every league:

| League | Path | Query |
| --- | --- | --- |
| NFL | `football/nfl` | `seasontype=2` and `week` |
| NBA | `basketball/nba` | `dates=YYYYMMDD` |
| MLB | `baseball/mlb` | `dates=YYYYMMDD` |
| NHL | `hockey/nhl` | `dates=YYYYMMDD` |
| WNBA | `basketball/wnba` | `dates=YYYYMMDD` |

Card time, score, status, and network name come from that response.

`listings.json` is NFL-only. `classify()` in `src/js/app.js` returns before reading it when the selected sport is not NFL. NBA, MLB, NHL, and WNBA show the ESPN network and do not attach a local station.

For NFL, a market is the largest entry in `public/data/markets.json` within 100 miles. Local classification uses FOX, CBS, NBC, and ABC only when that network is present in the listings file:

- FOX and CBS are local only when both team names appear in that station’s `episode`. Otherwise the game is elsewhere, or left unmarked when the week does not match or that station has no rows.
- NBC and ABC are local when that station has no rows. They are elsewhere when rows exist and the teams are not in them.
- Prime Video, ESPN, NFL Network, Netflix, and Peacock stay national.

A local kickoff links to the station URL in `sites` when one was stored. The browser never requests station sites or TV Passport.

`scripts/build_listings.py` is the only scraper, and it only builds NFL weeks. It reads `public/data/markets.json`, asks ESPN which week and which dates to cover, then writes `public/listings.json`.

## Weekly listings automation

`.github/workflows/build-and-deploy.yml` is the only workflow. It is the production job.

- Schedule: Tuesday at 08:00 UTC (`cron: "0 8 * * 2"`).
- Manual run: `workflow_dispatch`.
- Python 3.12 runs `python scripts/build_listings.py`.
- The script tries each station’s own listings page, then a TV Passport day page when that page is missing. One request at a time.
- Disk cache: `scripts/cache/listings/`, gitignored. The filename is `{stationId}-{YYYY-MM-DD}.json`.
- Node 20 runs `npm ci`, then `npm run build`.
- `scripts/publish.mjs` copies `dist/` to the repository root.
- If those files changed, the job commits and pushes to `main`. If nothing changed, it does not commit.

The Actions cache is:

```yaml
key: station-listings-${{ github.run_id }}
restore-keys: station-listings-
```

`github.run_id` is different on every run, so the exact key is never restored. The `station-listings-` prefix restores the newest previous cache, which is how pages are reused across Tuesdays.

A failed ESPN or sitemap request stops the script before it writes `public/listings.json`. A failed station page is skipped. The job does not publish unless the build commits something new.

## GitHub Pages

The repository is designed around:

```text
main branch
+
repository root
```

The repository cannot verify the GitHub Pages source setting. Confirm in GitHub that Pages is configured to serve `main` from `/`.

`public/CNAME` is `specialpancakes.com`. The build copies it to the root.

## NFL listings schema

`public/listings.json` looks like this:

```text
{
  week,
  fetchedAt,
  dates,
  games: {
    "CALLSIGN|NETWORK": [
      {
        start,
        show,
        episode
      }
    ]
  },
  sites: {
    "CALLSIGN|NETWORK": "https://station.example/"
  }
}
```

`games` is how the page decides whether a station listed that NFL game. The match uses `episode`. `sites` is the station website linked from a local kickoff. `fetchedAt` and `dates` are written by the scraper. The page does not read them.

There is one week in the file. Changing the shape means changing `scripts/build_listings.py` and `src/js/app.js` together.

## Browser caching

Both caches are `localStorage`. If storage throws, the page continues without it.

ESPN:

- Key: `cf.espn.v2|{league}|week:{n}` or `cf.espn.v2|{league}|day:{YYYY-MM-DD}`
- Kept for 24 hours when the selected day is in the past, or when every game is already final and has kicked off. Otherwise kept for 1 hour.
- Refresh schedule skips the read and stores a new entry. It does not clear other leagues or weeks.

NFL listings:

- Key: `cf_listings_week_{n}`
- The whole loaded file, stored when `/listings.json` loads.
- Used only for NFL, and only when the file’s `week` is not the week on screen.
- A mismatched week shows national networks plus the line “Local station maps are optimized for the current NFL week.”

## SEO

`src/js/seoEngine.js` sets the title, meta description, canonical URL, Open Graph tags, Twitter tags, and a `SportsEvent` JSON-LD snippet when a game is selected. Query params that matter are `sport`, `week` or `day`, `zip`, `team`, and `game`.

Default title: `What Channel is the Game On? | Special Pancakes`. A non-NFL league title is `What Channel is {League} On Today? | Special Pancakes`. A matchup title includes both teams and the date.

`scripts/generateSitemap.js` writes `public/sitemap.xml` (the home page and `?sport=` for NFL, NBA, MLB, NHL, and WNBA) and `public/robots.txt` (`Allow: /` and the sitemap URL). The production build copies both to the repository root.

## Important current limitations

These are future engineering work. They are known and are not being fixed in the handoff.

1. A successful scraper run can overwrite `public/listings.json` with an empty `games` object if ESPN returns a week and none of its broadcasts produce FOX, CBS, NBC, or ABC dates. The script still exits 0, and the weekly job can commit that file.
2. Station-page cache entries have no expiry. A cached page is reused on later runs, including through the Actions cache, until that file is removed.
3. “Follow a team” records `?team=` and the `search_team` analytics event. It does not filter the cards.

## Developer rules

- Edit `src/` for application behavior.
- Edit `public/` for static data and assets when that is the source of the change.
- Do not hand-edit generated root Pages files.
- Do not modify the NFL listings schema without updating both the scraper and the frontend.
- Do not make non-NFL leagues depend on NFL station data.
- Do not reintroduce React or the deleted legacy applications.
- Do not create a second scraper.
- Do not create duplicate copies of application source.
- Do not casually change external API endpoints.
- Run `npm run build` before publishing application changes.
- Verify the root generated files after a production build.
- Treat the Tuesday workflow as production infrastructure.

## Where to look

| If I need to change... | Look here |
| --- | --- |
| Game cards | `src/js/app.js` |
| Routing/query params | `src/js/router.js` |
| SEO | `src/js/seoEngine.js` |
| Styling | `src/css/` |
| Theme | `src/js/theme.js` |
| Analytics | `src/js/analytics.js` |
| City/ZIP data | `public/places.txt` |
| TV market data | `public/data/markets.json` |
| NFL station data | `public/listings.json` |
| Station scraper | `scripts/build_listings.py` |
| Sitemap generation | `scripts/generateSitemap.js` |
| Root publishing | `scripts/publish.mjs` |
| Weekly automation | `.github/workflows/build-and-deploy.yml` |
