import { build } from "esbuild";
import { rm } from "node:fs/promises";

if (process.argv.includes("--clean")) {
  await rm("dist", { recursive: true, force: true });
} else {
  await build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2022",
    jsx: "automatic",
    packages: "external",
    logLevel: "info",
  });
}
