import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PackageManagerPin = {
  integrity: string;
  name: "pnpm";
  spec: string;
  version: string;
};

export const parsePackageManagerPin = (value: unknown): PackageManagerPin => {
  if (typeof value !== "string") {
    throw new Error("packageManager must be a string");
  }
  const match = value.match(
    /^(pnpm)@(\d+\.\d+\.\d+)\+(sha512\.[a-f0-9]{128})$/,
  );
  if (
    match?.[1] !== "pnpm" ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    throw new Error(
      "packageManager must pin an exact pnpm version and sha512 integrity",
    );
  }
  return {
    integrity: match[3],
    name: match[1],
    spec: value,
    version: match[2],
  };
};

export const corepackInstallArgs = (
  pin: PackageManagerPin,
): ["install", "--global", string] => ["install", "--global", pin.spec];

const install = (): void => {
  const root = resolve(import.meta.dirname, "..");
  const manifest: unknown = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  if (manifest === null || typeof manifest !== "object") {
    throw new Error("package.json must contain an object");
  }
  const pin = parsePackageManagerPin(
    (manifest as { packageManager?: unknown }).packageManager,
  );
  const run = (command: string, args: string[]): string => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} failed`);
    }
    return result.stdout.trim();
  };

  run("corepack", ["enable"]);
  // Corepack verifies the integrity suffix before activating this exact archive.
  run("corepack", corepackInstallArgs(pin));
  const actualVersion = run("pnpm", ["--version"]);
  if (actualVersion !== pin.version) {
    throw new Error(
      `pnpm version mismatch: expected ${pin.version}, received ${actualVersion}`,
    );
  }
  process.stdout.write(`pnpm ${actualVersion} integrity pin verified\n`);
};

const directExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (directExecution) {
  install();
}
