import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "web/dist");

if (!existsSync(resolve(dist, "index.html"))) {
  console.error("web/dist is missing. Run the Vite build first.");
  process.exit(1);
}

for (const name of ["assets", "data"]) {
  rmSync(resolve(root, name), { recursive: true, force: true });
}

cpSync(resolve(dist, "index.html"), resolve(root, "index.html"));
if (existsSync(resolve(dist, "favicon.svg"))) {
  cpSync(resolve(dist, "favicon.svg"), resolve(root, "favicon.svg"));
}
cpSync(resolve(dist, "assets"), resolve(root, "assets"), { recursive: true });
if (existsSync(resolve(dist, "data"))) {
  mkdirSync(resolve(root, "data"), { recursive: true });
  cpSync(resolve(dist, "data"), resolve(root, "data"), { recursive: true });
}
writeFileSync(resolve(root, ".nojekyll"), "");
console.log("Published the built app to the repository root for GitHub Pages.");
