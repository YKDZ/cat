import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadWorkspacePackages } from "./workspace-boundaries.ts";

const root = resolve(import.meta.dirname, "..");

type TypecheckManifest = {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const typecheckManifests = (): Array<{
  manifest: TypecheckManifest;
  path: string;
}> =>
  [
    resolve(root, "package.json"),
    ...loadWorkspacePackages(root).map(({ manifestPath }) => manifestPath),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      manifest: JSON.parse(readFileSync(path, "utf8")) as TypecheckManifest,
      path: relative(root, path),
    }))
    .filter(({ manifest }) => manifest.scripts?.typecheck !== undefined);

type TurboDryTask = {
  taskId: string;
  command: string;
  hash: string;
  hashOfExternalDependencies: string;
  outputs: string[] | null;
  resolvedTaskDefinition: {
    cache: boolean;
    dependsOn: string[];
    env: string[];
    inputs: string[];
    persistent: boolean;
  };
};

const dryTasks = (...args: string[]): TurboDryTask[] => {
  return dryTasksAt(root, ...args);
};

const dryTasksAt = (cwd: string, ...args: string[]): TurboDryTask[] => {
  const output = execFileSync(
    "pnpm",
    ["turbo", "run", ...args, "--dry=json", "--no-color"],
    { cwd, encoding: "utf8" },
  );
  return (
    JSON.parse(output.slice(output.indexOf("{"))) as {
      tasks: TurboDryTask[];
    }
  ).tasks;
};

const createLintHashFixture = (): string => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "cat-turbo-lint-hash-"));
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "oxfmt.config.ts",
    "oxlint.config.ts",
    "tsconfig.json",
  ]) {
    cpSync(resolve(root, file), resolve(fixtureRoot, file));
  }
  mkdirSync(resolve(fixtureRoot, "packages/typescript-config"), {
    recursive: true,
  });
  cpSync(
    resolve(root, "packages/typescript-config"),
    resolve(fixtureRoot, "packages/typescript-config"),
    { recursive: true },
  );
  mkdirSync(resolve(fixtureRoot, "packages/shared"), { recursive: true });
  cpSync(
    resolve(root, "packages/shared/package.json"),
    resolve(fixtureRoot, "packages/shared/package.json"),
  );
  cpSync(
    resolve(root, "packages/shared/tsconfig.json"),
    resolve(fixtureRoot, "packages/shared/tsconfig.json"),
  );
  cpSync(
    resolve(root, "tooling/oxlint"),
    resolve(fixtureRoot, "tooling/oxlint"),
    { recursive: true },
  );
  symlinkSync(
    resolve(root, "node_modules"),
    resolve(fixtureRoot, "node_modules"),
  );
  return fixtureRoot;
};

describe("Turbo workspace contract", () => {
  it("discovers workspace manifests without a shell search dependency", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "cat-no-rg-"));
    const previousPath = process.env.PATH;
    try {
      process.env.PATH = directory;
      expect(typecheckManifests().map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          "package.json",
          "apps/app/package.json",
          "apps/docs/package.json",
          "packages/shared/package.json",
        ]),
      );
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("runs every plain TypeScript compiler command through root-native TS7", () => {
    const manifests = typecheckManifests();
    let nativeTscCommands = 0;

    for (const { manifest, path } of manifests) {
      for (const command of Object.values(manifest.scripts ?? {})) {
        for (const segment of command.split(" && ")) {
          if (!/(?:^|[\s;&|])tsc(?:\s|$)/.test(segment)) continue;
          nativeTscCommands += 1;
          const match =
            /^pnpm --workspace-root exec tsc (?:(?:--noEmit --pretty false -p)|(?:--pretty false -p)|--build) (\S+)(?: --noEmit --pretty false)?$/.exec(
              segment,
            );
          expect(match, `${path}: ${segment}`).not.toBeNull();
          const configPath = match?.[1]?.replace(/^\.\//u, "");
          if (path !== "package.json") {
            expect(configPath, `${path}: ${segment}`).toMatch(
              new RegExp(`^${dirname(path)}/tsconfig(?:\\.[\\w-]+)?\\.json$`),
            );
          }
        }
      }
      if (manifest.scripts?.typecheck?.includes("vue-tsc")) {
        expect(manifest.devDependencies?.typescript, path).toBe("catalog:");
      }
    }

    expect(nativeTscCommands).toBeGreaterThan(0);
  });

  it("signs remote cache artifacts when CI injects the signature key", () => {
    const config = JSON.parse(
      readFileSync(resolve(root, "turbo.json"), "utf8"),
    ) as { remoteCache?: { signature?: boolean } };
    const workflow = readFileSync(
      resolve(root, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(config.remoteCache?.signature).toBe(true);
    expect(workflow).toContain("TURBO_REMOTE_CACHE_SIGNATURE_KEY");
  });

  it("runs real docs build, typecheck, and dev tasks", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "apps/docs/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(manifest.scripts).toMatchObject({
      build: "vitepress build src",
      dev: "vitepress dev src",
      typecheck:
        "pnpm --workspace-root exec tsc --build apps/docs/tsconfig.json --noEmit --pretty false && vue-tsc --noEmit --pretty false -p tsconfig.app.json",
    });

    const tasks = dryTasks("build", "typecheck", "dev", "--filter=@cat/docs");
    for (const name of ["build", "typecheck", "dev"]) {
      const task = tasks.find(({ taskId }) => taskId === `@cat/docs#${name}`);
      expect(task?.command, name).not.toBe("<NONEXISTENT>");
    }
    expect(
      tasks.find(({ taskId }) => taskId === "@cat/docs#dev")
        ?.resolvedTaskDefinition,
    ).toMatchObject({ cache: false, persistent: true });
    expect(tasks.some(({ taskId }) => taskId === "@cat/docs#preview")).toBe(
      false,
    );
  });

  it("owns CLI route generation with cross-package inputs and one output", () => {
    const task = dryTasks("generate:routes", "--filter=@cat/cli").find(
      ({ taskId }) => taskId === "@cat/cli#generate:routes",
    );

    expect(task?.command).not.toBe("<NONEXISTENT>");
    expect(task?.outputs).toEqual(["src/routes.generated.ts"]);
    expect(task?.resolvedTaskDefinition.inputs.join("\n")).toContain(
      "packages/app-api/src/orpc/router.ts",
    );
    expect(task?.resolvedTaskDefinition.inputs.join("\n")).toContain(
      "packages/app-api/src/orpc/routers/**/*.ts",
    );
  });

  it("keeps validation service-free and hashes the intended shared inputs", () => {
    const turbo = JSON.parse(
      readFileSync(resolve(root, "turbo.json"), "utf8"),
    ) as {
      globalDependencies: string[];
      tasks: Record<
        string,
        {
          dependsOn?: string[];
          env?: string[];
          inputs?: string[];
          outputs?: string[];
        }
      >;
    };

    expect(turbo.globalDependencies).toContain("tooling/oxlint/**");
    expect(turbo.globalDependencies).toContain(
      "packages/typescript-config/*.json",
    );
    expect(turbo.tasks["format:check"]?.dependsOn ?? []).not.toContain(
      "^format:check",
    );
    expect(turbo.tasks.lint?.dependsOn ?? []).not.toContain("^lint");
    expect(turbo.tasks["test:unit"]?.env).toContain("CI");
    expect(turbo.tasks["test:integration"]?.env).toContain("SPACY_SERVER_URL");
    expect(turbo.tasks["pack:artifact"]?.inputs).toEqual(
      expect.arrayContaining([
        "$TURBO_ROOT$/scripts/pack-package-artifact.ts",
        "$TURBO_ROOT$/pnpm-workspace.yaml",
      ]),
    );
    for (const task of ["format:check", "lint", "typecheck", "test:unit"]) {
      expect(turbo.tasks[task]?.outputs ?? []).toEqual([]);
    }

    const lint = dryTasks("lint", "--filter=@cat/shared").find(
      ({ taskId }) => taskId === "@cat/shared#lint",
    );
    expect(lint?.hashOfExternalDependencies).toMatch(/^[0-9a-f]+$/);
  });

  it("runs root quality tasks directly through explicit root task definitions", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const turbo = JSON.parse(
      readFileSync(resolve(root, "turbo.json"), "utf8"),
    ) as { tasks: Record<string, unknown> };

    for (const task of [
      "boundaries",
      "codegen:check",
      "format:check",
      "lint",
      "test:tooling",
      "typecheck",
    ]) {
      expect(turbo.tasks[`//#${task}`], task).toBeDefined();
      expect(manifest.scripts?.[task], task).not.toMatch(/\bturbo\s+run\b/);
    }
    expect(manifest.scripts?.boundaries).toBe(
      "node scripts/workspace-boundaries.ts",
    );
    expect(
      readFileSync(resolve(root, "scripts/workspace-boundaries.ts"), "utf8"),
    ).toContain('"node_modules", "turbo", "bin", "turbo"');
  });

  it("invalidates lint hashes when an Oxc implementation dependency changes", () => {
    const fixtureRoot = createLintHashFixture();
    const probe = resolve(fixtureRoot, "tooling/oxlint/no-server-import.ts");
    const beforeSource = readFileSync(probe, "utf8");
    const hash = (): string | undefined =>
      dryTasksAt(fixtureRoot, "lint", "--filter=@cat/shared").find(
        ({ taskId }) => taskId === "@cat/shared#lint",
      )?.hash;
    try {
      const before = hash();
      writeFileSync(probe, `${beforeSource}\n`);
      expect(hash()).not.toBe(before);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("invalidates typecheck and build hashes when shared TS policy changes", () => {
    const fixtureRoot = createLintHashFixture();
    const preset = resolve(fixtureRoot, "packages/typescript-config/base.json");
    const hashes = (): Record<string, string> =>
      Object.fromEntries(
        dryTasksAt(fixtureRoot, "typecheck", "build", "--filter=@cat/shared")
          .filter(({ taskId }) =>
            ["@cat/shared#build", "@cat/shared#typecheck"].includes(taskId),
          )
          .map(({ hash, taskId }) => [taskId, hash]),
      );

    try {
      const before = hashes();
      writeFileSync(preset, `${readFileSync(preset, "utf8")}\n`);
      const after = hashes();
      expect(after["@cat/shared#typecheck"]).not.toBe(
        before["@cat/shared#typecheck"],
      );
      expect(after["@cat/shared#build"]).not.toBe(before["@cat/shared#build"]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
