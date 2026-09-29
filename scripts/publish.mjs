import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

if (!existsSync(resolve(dist, "index.html"))) {
  console.error("dist/index.html is missing. Run the Vite build first.");
  process.exit(1);
}

rmSync(resolve(root, "assets"), { recursive: true, force: true });
cpSync(resolve(dist, "assets"), resolve(root, "assets"), { recursive: true });
cpSync(resolve(dist, "index.html"), resolve(root, "index.html"));

for (const name of readdirSync(dist)) {
  if (name === "assets" || name === "index.html") continue;
  const from = resolve(dist, name);
  const to = resolve(root, name);
  cpSync(from, to, { recursive: true });
}

writeFileSync(resolve(root, ".nojekyll"), "");
console.log("Published dist to the repository root for GitHub Pages.");
