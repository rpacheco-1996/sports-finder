import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteUrl = "https://specialpancakes.com";
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const sports = ["nfl", "nba", "mlb", "nhl", "wnba"];

function loc(query) {
  const base = siteUrl.replace(/\/$/, "");
  return query ? `${base}/?${query}` : `${base}/`;
}

const urls = [loc(""), ...sports.map((sport) => loc(`sport=${sport}`))];
const body = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

mkdirSync(publicDir, { recursive: true });
writeFileSync(resolve(publicDir, "sitemap.xml"), body);
writeFileSync(
  resolve(publicDir, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl.replace(/\/$/, "")}/sitemap.xml\n`,
);
console.log(`Wrote sitemap.xml with ${urls.length} urls.`);
