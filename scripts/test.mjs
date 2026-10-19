import { build } from "esbuild";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temp = await mkdtemp(join(tmpdir(), "lens-image-explorer-tests-"));
try {
  const entries = (await readdir("tests")).filter((name) => name.endsWith(".test.ts")).map((name) => `tests/${name}`);
  await build({ entryPoints: entries, outdir: temp, outExtension: { ".js": ".cjs" },
    bundle: true, platform: "node", format: "cjs", packages: "external" });
  const tests = (await readdir(temp)).filter((name) => name.endsWith(".cjs")).map((name) => join(temp, name));
  const result = spawnSync(process.execPath, ["--test", ...tests], {
    stdio: "inherit", env: { ...process.env, NODE_PATH: resolve("node_modules") },
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
