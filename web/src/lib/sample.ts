import { MAP_HEIGHT, MAP_WIDTH, albersXY } from "./albers";
import { publicUrl } from "./url";
import type { Coverage, Place } from "../types";

type Palette = Map<number, [number, number, number]>;

function paletteOf(coverage: Coverage): Palette {
  const map: Palette = new Map();
  for (const [id, rgb] of Object.entries(coverage.palette)) {
    map.set(Number(id), rgb);
  }
  return map;
}

function nearest(
  rgb: [number, number, number],
  palette: Palette,
  thresh = 55,
): number | null {
  const [r, g, b] = rgb;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 25) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (const [id, color] of palette) {
    const d = Math.hypot(r - color[0], g - color[1], b - color[2]);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best !== null && bestD < thresh ? best : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Map image failed"));
    image.src = src;
  });
}

function sampleImage(
  image: HTMLImageElement,
  lon: number,
  lat: number,
  palette: Palette,
): number | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const [rawX, rawY] = albersXY(lon, lat);
  const x = (image.naturalWidth / MAP_WIDTH) * rawX;
  const y = (image.naturalHeight / MAP_HEIGHT) * rawY;
  const radius = 8;
  const votes = new Map<number, number>();
  const x0 = Math.max(0, Math.floor(x) - radius);
  const y0 = Math.max(0, Math.floor(y) - radius);
  const x1 = Math.min(image.naturalWidth - 1, Math.floor(x) + radius);
  const y1 = Math.min(image.naturalHeight - 1, Math.floor(y) + radius);
  if (x1 < x0 || y1 < y0) return null;
  const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  const width = x1 - x0 + 1;
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const i = ((py - y0) * width + (px - x0)) * 4;
      if (data[i + 3] < 200) continue;
      const swatch = nearest([data[i], data[i + 1], data[i + 2]], palette);
      if (swatch !== null) votes.set(swatch, (votes.get(swatch) ?? 0) + 1);
    }
  }
  let winner: number | null = null;
  let count = 0;
  for (const [id, n] of votes) {
    if (n > count) {
      winner = id;
      count = n;
    }
  }
  return winner;
}

/** Returns network|slot → swatch id for this place. */
export async function sampleMarket(coverage: Coverage, place: Place): Promise<Record<string, number | null>> {
  const samples: Record<string, number | null> = {};
  const palette = paletteOf(coverage);
  const outlying = place.state === "AK" || place.state === "HI" ? coverage.outlying[place.state] : null;

  await Promise.all(
    coverage.maps.map(async (map) => {
      const key = `${map.network}|${map.slot}`;
      if (outlying && key in outlying) {
        samples[key] = outlying[key];
        return;
      }
      if (outlying) {
        samples[key] = null;
        return;
      }
      try {
        const image = await loadImage(publicUrl(`data/${map.file}`));
        samples[key] = sampleImage(image, place.lon, place.lat, palette);
      } catch {
        samples[key] = null;
      }
    }),
  );
  return samples;
}
