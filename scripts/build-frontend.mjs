import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(repoRoot, "dist/public");

// Build into a clean, explicit allowlist so repository files cannot enter the
// static site's publish directory by accident.
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  cpSync(resolve(repoRoot, file), resolve(publicDir, file));
}

for (const directory of ["css", "icons", "js"]) {
  cpSync(resolve(repoRoot, directory), resolve(publicDir, directory), {
    recursive: true,
    filter: (source) => !source.endsWith(".map") && !source.endsWith("README.md"),
  });
}

console.log(`Frontend published to ${publicDir}`);
