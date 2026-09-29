import { site } from "../config";
import type { Listing, Sport } from "../types";

type Meta = {
  title: string;
  description: string;
  canonical: string;
  type: "website" | "event";
  event: SportsEvent | null;
};

type SportsEvent = {
  "@context": "https://schema.org";
  "@type": "SportsEvent";
  name: string;
  startDate?: string;
  homeTeam: { "@type": "SportsTeam"; name: string };
  awayTeam: { "@type": "SportsTeam"; name: string };
  broadcastAffiliate?: { "@type": "BroadcastService"; name: string };
};

const DEFAULT_TITLE = "What Channel is the Game On? | Fast Live Sports TV Finder";
const DEFAULT_DESCRIPTION =
  "Find what channel and streaming service is carrying today's games. Instant local and national listings for NFL, NBA, MLB, NHL, and WNBA.";

export function gameSlug(game: {
  away: { short: string; name: string };
  home: { short: string; name: string };
}): string {
  const part = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const away = part(game.away.short || game.away.name);
  const home = part(game.home.short || game.home.name);
  return `${away}-vs-${home}`;
}

export function applyPageSeo(options: {
  sport: Sport;
  game: Listing | null;
  dateLabel: string;
  canonicalParams: URLSearchParams;
}): void {
  try {
    const meta = describe(options);
    document.title = meta.title;
    setMeta("name", "description", meta.description);
    setLink("canonical", meta.canonical);
    setMeta("property", "og:title", meta.title);
    setMeta("property", "og:description", meta.description);
    setMeta("property", "og:url", meta.canonical);
    setMeta("property", "og:type", meta.type);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", meta.title);
    setMeta("name", "twitter:description", meta.description);
    setSchema(meta.event);
  } catch {
    /* A missing head node should not block the schedule. */
  }
}

function describe(options: {
  sport: Sport;
  game: Listing | null;
  dateLabel: string;
  canonicalParams: URLSearchParams;
}): Meta {
  const canonical = canonicalUrl(options.canonicalParams);
  const game = options.game;
  if (game) {
    const away = game.away.name || game.away.short;
    const home = game.home.name || game.home.short;
    const date = options.dateLabel || "today";
    const networks = game.networks.join(" / ");
    const event: SportsEvent = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${away} vs ${home}`,
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
    };
    if (game.kickoff) event.startDate = game.kickoff;
    if (networks) event.broadcastAffiliate = { "@type": "BroadcastService", name: networks };
    return {
      title: `What Channel is ${away} vs ${home} On? (${date}) | TV & Streaming Listings`,
      description: `Find out what channel, TV network, or streaming service is broadcasting ${away} vs ${home} live. Instant local and national listings.`,
      canonical,
      type: "event",
      event,
    };
  }
  if (options.sport.id !== "nfl") {
    const league = options.sport.label;
    return {
      title: `What Channel is ${league} On Today? | Live Broadcast Schedule`,
      description: `See what channel ${league} is on today, including local TV and national or streaming broadcasts.`,
      canonical,
      type: "website",
      event: null,
    };
  }
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical,
    type: "website",
    event: null,
  };
}

function canonicalUrl(params: URLSearchParams): string {
  const base = site.url.replace(/\/$/, "");
  const query = params.toString();
  return query ? `${base}/?${query}` : `${base}/`;
}

function setMeta(attr: "name" | "property", key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function setLink(rel: string, href: string): void {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", rel);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function setSchema(event: SportsEvent | null): void {
  const id = "sports-event";
  let node = document.getElementById(id);
  if (!event) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("script");
    node.id = id;
    node.setAttribute("type", "application/ld+json");
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(event);
}
