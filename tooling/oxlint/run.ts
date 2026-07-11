import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const invocationDirectory = process.cwd();

const toRootRelativePath = (path: string): string => {
  const absolutePath = resolve(invocationDirectory, path);
  const relativePath = relative(root, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Quality targets must be inside the repository: ${path}`);
  }

  return relativePath === "" ? "." : relativePath.split(sep).join("/");
};

const mode = process.argv[2];
if (
  mode !== "lint" &&
  mode !== "lint:fix" &&
  mode !== "format" &&
  mode !== "format:fix"
) {
  throw new Error("Usage: run.ts <lint|lint:fix|format|format:fix> [path ...]");
}

const requestedTargets = process.argv.slice(3);
const targets =
  requestedTargets.length === 0
    ? [toRootRelativePath(".")]
    : requestedTargets.map(toRootRelativePath);

const isLint = mode === "lint" || mode === "lint:fix";
const binary = resolve(
  root,
  `node_modules/${isLint ? "oxlint" : "oxfmt"}/bin/${isLint ? "oxlint" : "oxfmt"}`,
);
const config = isLint ? "oxlint.config.ts" : "oxfmt.config.ts";
const args = [
  binary,
  "--config",
  config,
  "--no-error-on-unmatched-pattern",
  ...(isLint
    ? ["--type-aware", ...(mode === "lint:fix" ? ["--fix"] : [])]
    : mode === "format"
      ? ["--check"]
      : []),
  ...targets,
];

const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
