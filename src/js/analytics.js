const MEASUREMENT_ID = "";

export function installAnalytics() {
  if (!MEASUREMENT_ID || document.getElementById("ga4")) return;
  try {
    const script = document.createElement("script");
    script.id = "ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args) {
      window.dataLayer.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID);
  } catch {
    /* Analytics never blocks the finder. */
  }
}

export function track(name, params) {
  try {
    if (!MEASUREMENT_ID || typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
  } catch {
    /* Ignore a blocked tag. */
  }
}
