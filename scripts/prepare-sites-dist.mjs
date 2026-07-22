import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";

const outputDir = new URL("../.output/", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);
const nitroEntry = new URL("server/index.mjs", distDir);
const sitesEntry = new URL("server/index.js", distDir);
const packageFile = new URL("package.json", distDir);

await rm(distDir, { recursive: true, force: true });
await cp(outputDir, distDir, { recursive: true });
await rename(nitroEntry, sitesEntry);

const packageJson = JSON.parse(await readFile(packageFile, "utf8"));
packageJson.type = "module";
packageJson.main = "./server/index.js";
await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
