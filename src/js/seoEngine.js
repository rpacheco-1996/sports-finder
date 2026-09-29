const SITE = "https://specialpancakes.com";
const BRAND = "Special Pancakes";

export function gameSlug(game) {
  const part = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${part(game.away.short || game.away.name)}-vs-${part(game.home.short || game.home.name)}`;
}

export function applySeo({ sport, game, dateLabel, params }) {
  try {
    const meta = describe(sport, game, dateLabel, params);
    document.title = meta.title;
    setMeta("name", "description", meta.description);
    setLink("canonical", meta.canonical);
    setMeta("property", "og:title", meta.title);
    setMeta("property", "og:description", meta.description);
    setMeta("property", "og:url", meta.canonical);
    setMeta("property", "og:type", game ? "event" : "website");
    setMeta("property", "og:site_name", BRAND);
    setMeta("property", "og:image", `${SITE}/logo.png`);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", meta.title);
    setMeta("name", "twitter:description", meta.description);
    setMeta("name", "twitter:image", `${SITE}/logo.png`);
    setSchema(meta.event);
  } catch {
    /* Metadata must never block the slate. */
  }
}

function describe(sport, game, dateLabel, params) {
  const canonical = canonicalUrl(params);
  if (game) {
    const away = game.away.name || game.away.short;
    const home = game.home.name || game.home.short;
    const networks = (game.networks || []).join(" / ");
    const event = {
      "@type": "SportsEvent",
      name: `${away} vs ${home}`,
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
    };
    if (game.kickoff) event.startDate = game.kickoff;
    if (networks) event.broadcastAffiliate = { "@type": "BroadcastService", name: networks };
    return {
      title: `What Channel is ${away} vs ${home} On? (${dateLabel || "today"}) | ${BRAND}`,
      description: `Find out what channel, TV network, or streaming service is broadcasting ${away} vs ${home}. Instant local and national listings on Special Pancakes.`,
      canonical,
      event,
    };
  }
  if (sport && sport.id !== "nfl") {
    return {
      title: `What Channel is ${sport.label} On Today? | ${BRAND}`,
      description: `See what channel ${sport.label} is on today, including local TV and national or streaming broadcasts.`,
      canonical,
      event: null,
    };
  }
  return {
    title: `What Channel is the Game On? | ${BRAND}`,
    description: "Find what channel the game is on today. Instant local and national TV and streaming listings for NFL, NBA, MLB, NHL, and WNBA from Special Pancakes.",
    canonical,
    event: null,
  };
}

function canonicalUrl(params) {
  const query = params.toString();
  return query ? `${SITE}/?${query}` : `${SITE}/`;
}

function setMeta(attr, key, content) {
  let node = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function setLink(rel, href) {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", rel);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function setSchema(event) {
  const website = {
    "@type": "WebSite",
    name: BRAND,
    url: `${SITE}/`,
    description: "What channel is the game on. Local and national sports TV listings.",
  };
  const id = "sports-event";
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement("script");
    node.id = id;
    node.setAttribute("type", "application/ld+json");
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": event ? [website, event] : [website],
  });
}
