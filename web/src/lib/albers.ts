// Calibrated Albers (CONUS) → 506sports 1280×720 map pixels.
// Same constants as chanel-finder/sunday_tv.py.
const MAP_SCALE = 1390;
const MAP_TX = 665;
const MAP_TY = 415;

export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 720;

export function albersXY(lon: number, lat: number): [number, number] {
  const phi1 = (29.5 * Math.PI) / 180;
  const phi2 = (45.5 * Math.PI) / 180;
  const phi0 = (38 * Math.PI) / 180;
  const lam0 = (-96 * Math.PI) / 180;
  const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const bigC = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
  const rho0 = Math.sqrt(bigC - 2 * n * Math.sin(phi0)) / n;
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const rho = Math.sqrt(bigC - 2 * n * Math.sin(phi)) / n;
  const theta = n * (lam - lam0);
  const x = rho * Math.sin(theta);
  const y = rho0 - rho * Math.cos(theta);
  return [MAP_TX + MAP_SCALE * x, MAP_TY - MAP_SCALE * y];
}
