import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error("Le sidecar getaroom est configuré pour macOS.");
}

const arch = process.arch;
const bunTarget = arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
const rustTarget = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
const output = path.resolve(`src-tauri/binaries/getaroom-relay-${rustTarget}`);
await mkdir(path.dirname(output), { recursive: true });

const result = spawnSync(
  "bun",
  ["run", "compile.ts", "--target", bunTarget, "--outfile", output],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
