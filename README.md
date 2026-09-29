# Special Pancakes

Special Pancakes answers one question: what channel is the game on, in the city you type. The public site is [https://specialpancakes.com/](https://specialpancakes.com/).

It is a Vite site written in plain HTML, CSS, and JavaScript. GitHub Pages serves the built files from the root of `main`. A Python script, run by hand or every Tuesday, fills in which local station carries each NFL game.

## Layout

```
.github/workflows/build-and-deploy.yml   weekly scrape, build, and commit
public/                                  files copied into the site as-is
  CNAME                                  specialpancakes.com
  logo.png                               brand mark
  favicon.ico                            browser icon
  robots.txt
  sitemap.xml                            generated
  places.txt                             US city and zip rows
  data/markets.json                      RabbitEars TV markets
  listings.json                          station schedules for one NFL week
scripts/
  build_listings.py                      station-guide scraper
  generateSitemap.js                     writes public/sitemap.xml
  publish.mjs                            copies dist/ onto the Pages root
src/
  index.html
  css/variables.css                      light and dark tokens
  css/components.css                     layout
  css/style.css                          entry
  js/app.js                              finder, ESPN, and rendering
  js/seoEngine.js                        titles, Open Graph, SportsEvent JSON-LD
  js/router.js                           query-string history
  js/theme.js                            light/dark switch
  js/analytics.js                        GA4 wrapper (off until an id is set)
package.json
vite.config.js                           base is /
```

`chanel-finder/` is the original Boise and Spirit Lake CLI. The live site does not use it.

## Local development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/ .

To refresh station schedules:

```bash
python3 scripts/build_listings.py
npm run build
```

`--week 4` forces a regular-season week. With no flag, the script asks ESPN for the current week and moves to the next week once every game in it has kicked off.

`npm run build` writes the sitemap, builds `dist/`, then copies that build to the repository root so GitHub Pages can serve it. `npm run build:sitemap` only writes `public/sitemap.xml` and `public/robots.txt`.

## How a page is built

1. `places.txt` turns a city or zip into coordinates. The biggest TV market within 100 miles in `public/data/markets.json` supplies the FOX, CBS, NBC, and ABC call signs.
2. The browser loads the ESPN scoreboard for the selected league. Results cache in `localStorage` for 60 minutes when a game is still upcoming, or 24 hours when the date is in the past. Refresh schedule skips that cache.
3. For the NFL, `public/listings.json` says which game each station listed. A FOX or CBS game is local only when both team names appear on that station's listing. NBC and ABC are treated as the local station unless that station's own guide leaves the game off. Prime Video, ESPN, and the other national feeds stay national.
4. Clicking a game writes `?game=bengals-vs-steelers` and `seoEngine.js` sets the title, description, canonical URL, Open Graph tags, and a `SportsEvent` snippet. League buttons write `?sport=nba` and the matching title.
5. The header logo is `public/logo.png`. Team marks are not shown.

## Theme

The page starts in light mode. The Dark button sets `data-theme` on `<html>` and stores the choice under `localStorage` key `theme`. Unset means light, not the operating-system setting.

## Analytics

`src/js/analytics.js` looks for a GA4 measurement id. The constant is empty, so no tag loads. Set `MEASUREMENT_ID` to start sending `select_sport`, `search_team`, and `view_game_details`.

## Deployment

`public/CNAME` contains `specialpancakes.com`. GitHub Pages must use the `main` branch root. The workflow `.github/workflows/build-and-deploy.yml` runs at 08:00 UTC on Tuesdays and when someone starts it by hand. It scrapes, builds, and commits the published files back to `main`. A failed station download is skipped; an empty ESPN response fails the job. If `main` is protected, allow the GitHub Actions bot to push.

The browser never calls station sites or TV Passport. Only the weekly script does, one request at a time, with a pause and a disk cache in `scripts/cache/listings`.
