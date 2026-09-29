import { site } from "../config";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function installAnalytics(): void {
  const id = site.gaMeasurementId;
  if (!id || document.getElementById("ga4")) return;
  try {
    const script = document.createElement("script");
    script.id = "ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", id);
  } catch {
    /* Analytics never blocks the finder. */
  }
}

export function track(name: string, params: Record<string, string>): void {
  try {
    if (!site.gaMeasurementId || typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
  } catch {
    /* Ignore a blocked tag. */
  }
}
