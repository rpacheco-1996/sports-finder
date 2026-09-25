import { publicUrl } from "./url";
import type { Coverage } from "../types";

export async function loadCoverage(signal?: AbortSignal): Promise<Coverage | null> {
  const response = await fetch(publicUrl("data/week.json"), { signal, cache: "no-cache" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Coverage maps failed to load");
  return (await response.json()) as Coverage;
}
