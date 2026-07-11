import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

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
  const output = execFileSync(
    "pnpm",
    ["turbo", "run", ...args, "--dry=json", "--no-color"],
    { cwd: root, encoding: "utf8" },
  );
  return (
    JSON.parse(output.slice(output.indexOf("{"))) as {
      tasks: TurboDryTask[];
    }
  ).tasks;
};

describe("Turbo workspace contract", () => {
  it("runs real docs build, typecheck, dev, and preview tasks", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "apps/docs/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(manifest.scripts).toMatchObject({
      build: "vitepress build src",
      dev: "vitepress dev src",
      preview: "vitepress preview src",
      typecheck:
        "tsc --noEmit -p tsconfig.app.json && vue-tsc --noEmit -p tsconfig.app.json",
    });

    const tasks = dryTasks(
      "build",
      "typecheck",
      "dev",
      "preview",
      "--filter=@cat/docs",
    );
    for (const name of ["build", "typecheck", "dev", "preview"]) {
      const task = tasks.find(({ taskId }) => taskId === `@cat/docs#${name}`);
      expect(task?.command, name).not.toBe("<NONEXISTENT>");
    }
    expect(
      tasks.find(({ taskId }) => taskId === "@cat/docs#dev")
        ?.resolvedTaskDefinition,
    ).toMatchObject({ cache: false, persistent: true });
    expect(
      tasks.find(({ taskId }) => taskId === "@cat/docs#preview")
        ?.resolvedTaskDefinition,
    ).toMatchObject({ cache: false, persistent: true, dependsOn: ["build"] });
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
    expect(turbo.globalDependencies).toContain("tsconfig.base.json");
    expect(turbo.tasks.format?.dependsOn ?? []).not.toContain("^format");
    expect(turbo.tasks.lint?.dependsOn ?? []).not.toContain("^lint");
    expect(turbo.tasks["test:unit"]?.env).toContain("CI");
    expect(turbo.tasks["pack:artifact"]?.inputs).toEqual(
      expect.arrayContaining([
        "$TURBO_ROOT$/scripts/pack-public-package.ts",
        "$TURBO_ROOT$/pnpm-workspace.yaml",
      ]),
    );
    for (const task of ["format", "lint", "typecheck", "test:unit"]) {
      expect(turbo.tasks[task]?.outputs ?? []).toEqual([]);
    }

    const lint = dryTasks("lint", "--filter=@cat/shared").find(
      ({ taskId }) => taskId === "@cat/shared#lint",
    );
    expect(lint?.hashOfExternalDependencies).toMatch(/^[0-9a-f]+$/);
  });

  it("invalidates task hashes when root lint tooling changes", () => {
    const probe = resolve(root, "tooling/oxlint/turbo-global-input-probe.ts");
    const hash = (): string | undefined =>
      dryTasks("lint", "--filter=@cat/shared").find(
        ({ taskId }) => taskId === "@cat/shared#lint",
      )?.hash;
    const before = hash();
    writeFileSync(probe, "export const turboGlobalInputProbe = true;\n");
    try {
      expect(hash()).not.toBe(before);
    } finally {
      unlinkSync(probe);
    }
  });
});
