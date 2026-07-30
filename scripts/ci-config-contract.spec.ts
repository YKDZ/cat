import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");

type WorkflowStep = {
  env?: Record<string, string>;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  if?: string;
  needs?: string[];
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
};

type Workflow = {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs?: Record<string, WorkflowJob>;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
};

type CompositeAction = {
  inputs?: Record<string, { default?: string; required?: boolean }>;
  runs?: { steps?: WorkflowStep[]; using?: string };
};

const workflow = parse(
  readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
) as Workflow;
const collectAction = readFileSync(
  resolve(root, ".github/actions/collect/action.yml"),
  "utf8",
);
const parsedCollectAction = parse(collectAction) as CompositeAction;
const sourceCollectorHelp = execFileSync(
  resolve(root, "packages/source-collector/src/cli.ts"),
  ["--help"],
  { encoding: "utf8" },
);
const screenshotCollectorHelp = execFileSync(
  resolve(root, "packages/screenshot-collector/src/cli.ts"),
  ["--help"],
  { encoding: "utf8" },
);

const actionStep = (name: string): WorkflowStep => {
  const step = parsedCollectAction.runs?.steps?.find(
    (candidate) => candidate.name === name,
  );
  expect(step, `Missing composite action step: ${name}`).toBeDefined();
  return step!;
};

const expectTurboRemoteCacheEnv = (env: Record<string, string> | undefined) => {
  for (const name of [
    "TURBO_TEAM",
    "TURBO_TOKEN",
    "TURBO_REMOTE_CACHE_SIGNATURE_KEY",
  ] as const) {
    const value = env?.[name] ?? "";
    expect(value).toContain("github.event_name == 'push'");
    expect(value).toContain("github.ref == 'refs/heads/main'");
    expect(value).toContain("github.event_name == 'workflow_dispatch'");
    if (name === "TURBO_TEAM") expect(value).toContain("vars.TURBO_TEAM");
    else expect(value).toContain("secrets.");
    if (name === "TURBO_REMOTE_CACHE_SIGNATURE_KEY") {
      expect(value).toContain("secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY");
      expect(value).not.toContain("TURBO_TOKEN");
    }
    expect(value).toContain("|| ''");
    expect(value).not.toContain("pull_request");
  }
};

describe("CI configuration contract", () => {
  it("uses the supported action majors without Node 20 runtime fallbacks", () => {
    const steps = Object.values(workflow.jobs ?? {}).flatMap(
      (job) => job.steps ?? [],
    );
    const uses = steps.map((step) => step.uses);

    expect(
      uses.filter((value) => value === "actions/checkout@v7"),
    ).toHaveLength(3);
    expect(
      uses.filter((value) => value === "actions/setup-node@v7"),
    ).toHaveLength(3);
    expect(uses).toContain("actions/cache/restore@v6");
    expect(uses).toContain("actions/cache/save@v6");
    expect(uses).toContain("actions/upload-artifact@v7");
    expect(uses).toContain("actions/download-artifact@v8");
    expect(uses).toContain("docker/setup-buildx-action@v4");
  });

  it("runs both complete gates for every pull request without secret-only conditions", () => {
    expect(workflow.on).toMatchObject({
      pull_request: null,
      push: { branches: ["main"] },
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toMatchObject({
      "cancel-in-progress": true,
    });
    expect(workflow.concurrency?.group).toContain("github.ref");

    const check = workflow.jobs?.check;
    const checkAll = workflow.jobs?.["check-all"];
    expect(check?.if).toBeUndefined();
    expect(checkAll?.if).toBeUndefined();
    expect(check?.steps?.some((step) => step.run === "pnpm check")).toBe(true);
    expect(
      checkAll?.steps?.some((step) => step.run === "pnpm check:all:ci"),
    ).toBe(true);
    for (const job of [check, checkAll]) {
      expect(JSON.stringify(job)).not.toMatch(
        new RegExp(["affected", "base-branch", "moon"].join("|"), "i"),
      );
    }
  });

  it("installs every configured Playwright browser from the workspace before check:all", () => {
    const steps = workflow.jobs?.["check-all"]?.steps ?? [];
    const installIndex = steps.findIndex(
      (step) => step.run === "pnpm test:e2e:install-browsers",
    );
    const checkAllIndex = steps.findIndex(
      (step) => step.run === "pnpm check:all:ci",
    );

    expect(installIndex).toBeGreaterThan(-1);
    expect(checkAllIndex).toBeGreaterThan(installIndex);
    expect(steps[installIndex]?.run).not.toContain("playwright install");
  });

  it("uploads rich Playwright evidence only when the E2E matrix fails", () => {
    const steps = workflow.jobs?.["check-all"]?.steps ?? [];
    const diagnostics = steps.find(
      (step) => step.name === "Upload failed E2E diagnostics",
    );

    expect(diagnostics).toMatchObject({
      if: "failure()",
      uses: "actions/upload-artifact@v7",
      with: {
        "include-hidden-files": true,
        "if-no-files-found": "ignore",
        path: ".tmp/e2e\n!.tmp/e2e/**/playwright/.auth/**\n",
      },
    });
    expect(diagnostics?.with?.name).toBe("e2e-diagnostics-${{ github.sha }}");
  });

  it("uses the integrity-aware package manager installer in every build job", () => {
    for (const name of ["check", "check-all"] as const) {
      const steps = workflow.jobs?.[name]?.steps ?? [];
      expect(
        steps.some((step) => step.uses?.startsWith("pnpm/action-setup@")),
      ).toBe(false);
      expect(
        steps.some(
          (step) => step.run === "node scripts/package-manager-pin.ts",
        ),
      ).toBe(true);
      expect(
        steps.some(
          (step) =>
            step.uses === "actions/setup-node@v7" &&
            step.with?.["node-version-file"] === "package.json" &&
            step.with?.["registry-url"] === "https://registry.npmjs.org" &&
            step.with?.cache === "pnpm" &&
            step.with?.["cache-dependency-path"] === "pnpm-lock.yaml",
        ),
      ).toBe(true);
    }

    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { packageManager?: string };
    expect(manifest.packageManager).toMatch(
      /^pnpm@\d+\.\d+\.\d+\+sha512\.[a-f0-9]{128}$/,
    );
    for (const file of ["apps/app/Dockerfile", ".devcontainer/Dockerfile"]) {
      const pin = readFileSync(resolve(root, file), "utf8").match(
        /^ARG PACKAGE_MANAGER_PIN=(.+)$/m,
      )?.[1];
      expect(pin, file).toBe(manifest.packageManager);
    }
  });

  it("uses Turbo and Buildx caches in CI without persisting .turbo", () => {
    for (const name of ["check", "check-all"] as const) {
      const steps = workflow.jobs?.[name]?.steps ?? [];
      const runStep = steps.find(
        (step) =>
          step.run === (name === "check" ? "pnpm check" : "pnpm check:all:ci"),
      );
      expectTurboRemoteCacheEnv(runStep?.env);
      expect(
        steps.some(
          (step) =>
            step.uses === "actions/cache/restore@v6" &&
            step.with?.path === ".turbo",
        ),
      ).toBe(false);
      expect(
        steps.some(
          (step) =>
            step.uses === "actions/cache/save@v6" &&
            step.with?.path === ".turbo",
        ),
      ).toBe(false);
      expect(JSON.stringify(workflow.jobs?.[name])).not.toContain(
        "github.event.pull_request.head.repo.full_name",
      );
    }
    const checkAllSteps = workflow.jobs?.["check-all"]?.steps ?? [];
    const restore = checkAllSteps.find(
      (step) => step.uses === "actions/cache/restore@v6",
    );
    const save = checkAllSteps.find(
      (step) => step.uses === "actions/cache/save@v6",
    );
    expect(
      checkAllSteps.some(
        (step) => step.uses === "docker/setup-buildx-action@v4",
      ),
    ).toBe(true);
    expect(restore?.with?.path).toBe(".cache/buildx");
    expect(restore?.with?.["restore-keys"]).toContain("-main-");
    expect(save?.with?.path).toBe(".cache/buildx");
    expect(save?.if).toContain("github.ref == 'refs/heads/main'");
    expect(save?.if).not.toContain("pull_request");
  });

  it("publishes only images exported by the successful main-branch gate", () => {
    const checkAllSteps = workflow.jobs?.["check-all"]?.steps ?? [];
    const release = workflow.jobs?.["release-images"];
    const releaseSteps = release?.steps ?? [];

    expect(
      checkAllSteps.some(
        (step) =>
          step.uses === "actions/upload-artifact@v7" &&
          step.with?.name === "validated-images-${{ github.sha }}",
      ),
    ).toBe(true);
    expect(release?.needs).toEqual(["check", "check-all"]);
    expect(release?.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(release?.permissions).toEqual({
      contents: "read",
      packages: "write",
    });
    expect(
      releaseSteps.some(
        (step) =>
          step.uses === "actions/download-artifact@v8" &&
          step.with?.name === "validated-images-${{ github.sha }}",
      ),
    ).toBe(true);
    const releaseCommands = releaseSteps
      .map((step) => step.run ?? "")
      .join("\n");
    expect(releaseCommands).toContain("pnpm container:verify-artifacts");
    expect(releaseCommands).toContain("pnpm release:images");
    expect(releaseCommands).not.toMatch(/(?:docker|sha256sum) /);
    expect(releaseCommands).not.toContain("pnpm ci:install");
    expect(
      releaseSteps.some((step) => step.uses === "docker/build-push-action@v6"),
    ).toBe(false);
  });

  it("uses package scripts for every post-activation CI shell command", () => {
    for (const job of Object.values(workflow.jobs ?? {})) {
      const activationIndex = (job.steps ?? []).findIndex(
        (step) =>
          step.name ===
          "Activate integrity-pinned pnpm for the exact Node runtime",
      );
      for (const step of (job.steps ?? []).slice(activationIndex + 1)) {
        if (step.run === undefined) continue;
        expect(step.run).toMatch(/^pnpm [A-Za-z0-9:_-]+$/);
      }
    }
  });

  it("aligns the exact Node patch and official image digest across every environment", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { engines?: { node?: string } };
    const nodeVersion = manifest.engines?.node;
    expect(nodeVersion).toMatch(/^24\.\d+\.\d+$/);
    expect(existsSync(resolve(root, ".node-version"))).toBe(false);
    const dockerfiles = ["apps/app/Dockerfile", ".devcontainer/Dockerfile"];
    const references = dockerfiles.flatMap((file) => {
      const source = readFileSync(resolve(root, file), "utf8");
      return [
        ...source.matchAll(
          /^FROM\s+(node:(\d+\.\d+\.\d+)-bookworm-slim@(sha256:[a-f0-9]{64}))(?:\s+AS\s+\S+)?$/gim,
        ),
      ].map(([, reference, version, digest]) => ({
        digest,
        file,
        reference,
        version,
      }));
    });

    expect(references).toHaveLength(4);
    expect(new Set(references.map(({ version }) => version))).toEqual(
      new Set([nodeVersion]),
    );
    expect(new Set(references.map(({ digest }) => digest))).toHaveLength(1);
    expect(new Set(references.map(({ reference }) => reference))).toHaveLength(
      1,
    );
  });

  it("gives a single Dependabot configuration non-overlapping ecosystem ownership", () => {
    const dependabot = parse(
      readFileSync(resolve(root, ".github/dependabot.yml"), "utf8"),
    ) as {
      updates?: Array<{
        directories?: string[];
        directory?: string;
        groups?: Record<string, { "group-by"?: string; patterns?: string[] }>;
        "package-ecosystem"?: string;
      }>;
      version?: number;
    };
    expect(existsSync(resolve(root, ["reno", "vate.json"].join("")))).toBe(
      false,
    );
    expect(dependabot.version).toBe(2);
    expect(
      dependabot.updates?.map((update) => update["package-ecosystem"]),
    ).toEqual(["npm", "docker", "docker", "github-actions"]);

    const npm = dependabot.updates?.find(
      (update) => update["package-ecosystem"] === "npm",
    );
    expect(npm?.directory).toBe("/");
    expect(npm?.groups).toHaveProperty("workspace-toolchain");
    expect(npm?.groups).toHaveProperty("testing");

    const nodeImages = dependabot.updates?.find(
      (update) => update.directories !== undefined,
    );
    expect(nodeImages?.["package-ecosystem"]).toBe("docker");
    expect(nodeImages?.directories).toEqual(["/.devcontainer", "/apps/app"]);
    expect(nodeImages?.groups?.["node-runtime"]).toEqual({
      "group-by": "dependency-name",
      patterns: ["node"],
    });
    expect(
      dependabot.updates?.filter(
        (update) => update["package-ecosystem"] === "github-actions",
      ),
    ).toHaveLength(1);
  });

  it("provides Docker CLI, buildx, and Compose through the Dockerfile-first devcontainer", () => {
    const config = JSON.parse(
      readFileSync(resolve(root, ".devcontainer/devcontainer.json"), "utf8"),
    ) as {
      build?: { dockerfile?: string };
      containerEnv?: Record<string, string>;
      features?: unknown;
      mounts?: string[];
      postCreateCommand?: string;
    };
    const dockerfile = readFileSync(
      resolve(root, ".devcontainer/Dockerfile"),
      "utf8",
    );
    expect(config.build?.dockerfile).toBe("Dockerfile");
    expect(config.features).toBeUndefined();
    expect(config.containerEnv?.DOCKER_HOST).toBe(
      "unix:///var/run/docker.sock",
    );
    expect(config.mounts).toContain(
      "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind",
    );
    expect(config.postCreateCommand).toContain("docker buildx version");
    expect(config.postCreateCommand).toContain("docker compose version");
    for (const dependency of [
      "docker-ce-cli",
      "docker-buildx-plugin",
      "docker-compose-plugin",
    ]) {
      expect(dockerfile).toContain(dependency);
    }
    expect(dockerfile).not.toMatch(
      /copilot|claude|codex|devcontainers\/features/i,
    );
  });

  it("keeps the parsed collection action aligned with the current collector CLIs", () => {
    expect(parsedCollectAction.runs?.using).toBe("composite");
    expect(parsedCollectAction.inputs).toMatchObject({
      "source-root-ref": { required: true },
      "screenshot-bindings": { required: false },
      "screenshot-routes": { required: false },
    });
    expect(parsedCollectAction.inputs).not.toHaveProperty("document-name");

    const sourceCollect = actionStep("Collect source elements").run!;
    const sourceExtract = actionStep(
      "Extract source elements for screenshots",
    ).run!;
    const screenshotFlow = actionStep("Capture and upload screenshots").run!;

    for (const option of [
      "--glob",
      "--framework",
      "--project-id",
      "--source-lang",
      "--source-root-ref",
      "--base-dir",
      "--output",
    ]) {
      expect(sourceCollectorHelp).toContain(option);
      expect(sourceCollect).toContain(option);
    }
    expect(sourceCollect).toContain(
      "packages/source-collector/src/cli.ts collect",
    );
    expect(sourceCollect).not.toContain("--document-name");
    expect(sourceExtract).toContain(
      "packages/source-collector/src/cli.ts extract",
    );
    expect(sourceExtract).toContain("--source-lang");
    expect(sourceExtract).toContain("/tmp/cat-source-extraction.json");

    for (const option of [
      "--base-url",
      "--routes",
      "--bindings",
      "--elements",
      "--output",
    ]) {
      expect(screenshotCollectorHelp).toContain(option);
      expect(screenshotFlow).toContain(option);
    }
    for (const option of [
      "--capture",
      "--bindings",
      "--project-id",
      "--api-url",
      "--api-key",
    ]) {
      expect(screenshotCollectorHelp).toContain(option);
      expect(screenshotFlow).toContain(option);
    }
    expect(screenshotFlow).toContain(
      "packages/screenshot-collector/src/cli.ts capture",
    );
    expect(screenshotFlow).toContain(
      "--elements /tmp/cat-source-extraction.json",
    );
    expect(screenshotFlow).toContain("--output /tmp/cat-capture-result.json");
    const captureStart = screenshotFlow.indexOf(
      "packages/screenshot-collector/src/cli.ts capture",
    );
    const uploadStart = screenshotFlow.indexOf(
      "packages/screenshot-collector/src/cli.ts upload",
    );
    const captureCommand = screenshotFlow.slice(captureStart, uploadStart);
    expect(captureCommand).toContain(
      '--bindings "${{ inputs.screenshot-bindings }}"',
    );
    expect(screenshotFlow).toContain(
      "packages/screenshot-collector/src/cli.ts upload",
    );
    expect(screenshotFlow).toContain("--capture /tmp/cat-capture-result.json");
    expect(captureStart).toBeLessThan(uploadStart);
    expect(collectAction).not.toContain(
      "packages/screenshot-collector/src/cli.ts collect",
    );
  });
});
