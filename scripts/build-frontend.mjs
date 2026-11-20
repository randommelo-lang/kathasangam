import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(repoRoot, "dist/public");

// Build into a clean, explicit allowlist so repository files cannot enter the
// static site's publish directory by accident.
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

for (const file of ["index.html", "privacy.html", "google.svg", "gift.svg", "styles.css", "robots.txt"]) {
  if (existsSync(resolve(repoRoot, file))) {
    cpSync(resolve(repoRoot, file), resolve(publicDir, file));
  }
}

// Copy any Google Search Console verification files (e.g. google*.html)
for (const entry of readdirSync(repoRoot)) {
  if (entry.startsWith("google") && entry.endsWith(".html")) {
    cpSync(resolve(repoRoot, entry), resolve(publicDir, entry));
  }
}
// Keep backend embedded template in sync with root index.html
try {
  cpSync(resolve(repoRoot, "index.html"), resolve(repoRoot, "backend/src/index_template.html"));
} catch (_) {}

for (const directory of ["css", "icons", "js"]) {
  cpSync(resolve(repoRoot, directory), resolve(publicDir, directory), {
    recursive: true,
    filter: (source) => !source.endsWith(".map") && !source.endsWith("README.md"),
  });
}

// Propagate the index.html asset version query string to all relative ES module
// imports in dist/public/js so mobile browsers cannot reuse stale cached sub-modules.
const indexHtml = readFileSync(resolve(publicDir, "index.html"), "utf8");
const versionMatch = indexHtml.match(/\/js\/main\.js\?v=([a-zA-Z0-9._-]+)/);
if (versionMatch) {
  const assetVersion = versionMatch[1];
  const rewriteJsImports = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "vendor") continue;
        rewriteJsImports(fullPath);
      } else if (entry.name.endsWith(".js")) {
        const src = readFileSync(fullPath, "utf8");
        const updated = src.replace(
          /(\bfrom\s+["'])(\.\.?\/[^"']+?\.js)(["'])/g,
          `$1$2?v=${assetVersion}$3`
        );
        if (updated !== src) {
          writeFileSync(fullPath, updated, "utf8");
        }
      }
    }
  };
  rewriteJsImports(resolve(publicDir, "js"));
}

console.log(`Frontend published to ${publicDir}`);
