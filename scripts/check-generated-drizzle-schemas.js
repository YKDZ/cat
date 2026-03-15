import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

const run = (command, args) => {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
};

try {
  run("pnpm", [
    "nx",
    "run",
    "@cat/db:codegen-schemas",
    "--output-style=static",
  ]);
  run("git", [
    "diff",
    "--exit-code",
    "--",
    "packages/shared/src/schema/drizzle",
  ]);
} catch {
  console.error(
    "Generated Drizzle Zod schemas are out of date. Run `pnpm nx run @cat/db:codegen-schemas --output-style=static` and commit the updated files.",
  );
  process.exit(1);
}
