import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

function walkJs(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "vendor") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJs(full));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

const files = walkJs("js");
for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`Syntax check passed for ${files.length} JS files.`);
