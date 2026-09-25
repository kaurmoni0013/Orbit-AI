import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const directories = ["config", "middlewares", "model", "routes", "service", "utils", "validators", "test"];
const files = ["app.js", "index.js"];

for (const directory of directories) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(join(directory, entry.name));
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", join(root, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${files.length} JavaScript files.`);
