import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  verificationExecutorCleanupHeadroomMs,
  verificationExecutorTimeoutBudget,
} from "./verification-executor.ts";

const root = resolve(import.meta.dirname, "..");

type WorkflowStep = {
  "continue-on-error"?: boolean;
  env?: Record<string, string>;
  id?: string;
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
  "timeout-minutes"?: number;
};

type Workflow = {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs?: Record<string, WorkflowJob>;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
};

const trustedMainRemoteCacheEnvironment = {
  TURBO_REMOTE_CACHE_SIGNATURE_KEY:
    "${{ (((github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')) && vars.TURBO_TEAM != '' && secrets.TURBO_TOKEN != '' && secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY != '') && secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY || '' }}",
  TURBO_TEAM:
    "${{ (((github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')) && vars.TURBO_TEAM != '' && secrets.TURBO_TOKEN != '' && secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY != '') && vars.TURBO_TEAM || '' }}",
  TURBO_TOKEN:
    "${{ (((github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')) && vars.TURBO_TEAM != '' && secrets.TURBO_TOKEN != '' && secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY != '') && secrets.TURBO_TOKEN || '' }}",
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
const setupNodePnpmAction = parse(
  readFileSync(
    resolve(root, ".github/actions/setup-node-pnpm/action.yml"),
    "utf8",
  ),
) as CompositeAction;
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

const compatibilityCohort = (
  patterns: string[],
): {
  "applies-to": "version-updates";
  patterns: string[];
  "update-types": ["patch", "minor"];
} => ({
  "applies-to": "version-updates",
  patterns,
  "update-types": ["patch", "minor"],
});

describe("CI configuration contract", () => {
  it("projects the typed plan into the distributed Complete Verification graph", () => {
    expect(workflow.on).toMatchObject({
      pull_request: null,
      push: { branches: ["main"] },
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toMatchObject({ "cancel-in-progress": true });

    const jobs = workflow.jobs ?? {};
    expect(jobs["check-all"]).toBeUndefined();
    expect(
      jobs.plan?.steps?.some(
        (step) => step.run === "pnpm ci:verification:plan",
      ),
    ).toBe(true);
    expect(Reflect.get(jobs.aggregate ?? {}, "name")).toBe(
      "Complete Verification",
    );
    expect(jobs.aggregate?.if).toBe("always()");
    expect(jobs.quality?.needs).toEqual(["plan"]);
    expect(jobs["source-artifacts"]?.needs).toEqual(["plan"]);
    expect(jobs["spacy-image"]?.needs).toEqual(["plan"]);
    expect(jobs["application-images"]?.needs).toEqual(["plan"]);
    expect(jobs.integration?.needs).toEqual(["spacy-image"]);
    expect(jobs["e2e-dev"]?.needs).toEqual(["spacy-image"]);
    expect(jobs["release-e2e"]?.needs).toEqual([
      "plan",
      "spacy-image",
      "application-images",
    ]);
    expect(jobs["container-lifecycle"]?.needs).toEqual([
      "spacy-image",
      "application-images",
    ]);
    expect(jobs.aggregate?.needs).toEqual([
      "quality",
      "source-artifacts",
      "spacy-image",
      "application-images",
      "integration",
      "e2e-dev",
      "release-e2e",
      "container-lifecycle",
    ]);
    expect(JSON.stringify(workflow)).not.toMatch(
      /Full Graph|check:all|legacy|preview|watch/i,
    );
  });

  it("uses non-fail-fast target matrices and scoped browser setup", () => {
    const jobs = workflow.jobs ?? {};
    const release = Reflect.get(
      jobs["release-e2e"] ?? {},
      "strategy",
    ) as Record<string, unknown>;
    expect(release["fail-fast"]).toBe(false);
    expect(release["max-parallel"]).toBe(2);
    expect(
      Reflect.get(jobs["source-artifacts"] ?? {}, "strategy"),
    ).toBeUndefined();
    expect(
      jobs["source-artifacts"]?.steps?.some(
        (step) => step.run === "pnpm ci:verification:run --lane source",
      ),
    ).toBe(true);
    expect(JSON.stringify(release)).toContain("needs.plan.outputs.e2e");
    expect(
      jobs["e2e-dev"]?.steps?.some(
        (step) => step.run === "pnpm ci:install:playwright:chromium",
      ),
    ).toBe(true);
    expect(
      jobs["release-e2e"]?.steps?.some(
        (step) => step.run === "pnpm ci:install:playwright:release",
      ),
    ).toBe(true);
    const workflowSource = readFileSync(
      resolve(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    expect(workflowSource).not.toMatch(/browser:\s*(chromium|firefox)/i);
  });

  it("installs Python and spaCy tooling only for the quality contract", () => {
    const jobs = workflow.jobs ?? {};
    expect(
      jobs.quality?.steps?.some((step) =>
        step.uses?.startsWith("astral-sh/setup-uv@"),
      ),
    ).toBe(true);
    expect(
      jobs.quality?.steps?.some((step) => step.run === "pnpm ci:setup:spacy"),
    ).toBe(true);
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "quality") continue;
      expect(
        job.steps?.some((step) => step.uses?.startsWith("astral-sh/setup-uv@")),
      ).toBe(false);
      expect(
        job.steps?.some((step) => step.run === "pnpm ci:setup:spacy"),
      ).toBe(false);
    }
  });

  it("transports candidates and records through short-lived Actions artifacts", () => {
    const jobs = workflow.jobs ?? {};
    for (const name of [
      "quality",
      "source-artifacts",
      "spacy-image",
      "application-images",
      "integration",
      "e2e-dev",
      "release-e2e",
      "container-lifecycle",
    ]) {
      const job = jobs[name];
      expect(
        job?.steps?.some(
          (step) =>
            step.uses === "actions/upload-artifact@v7" &&
            String(step.with?.name).includes("verification-record-"),
        ),
      ).toBe(true);
      const upload = job?.steps?.find(
        (step) =>
          step.uses === "actions/upload-artifact@v7" &&
          String(step.with?.name).includes("verification-record-"),
      );
      expect(upload?.if).toBe("success()");
      expect(upload?.with?.overwrite).toBe(true);
    }
    for (const name of [
      "integration",
      "e2e-dev",
      "release-e2e",
      "container-lifecycle",
    ]) {
      expect(
        jobs[name]?.steps?.some(
          (step) => step.uses === "actions/download-artifact@v8",
        ),
      ).toBe(true);
    }
    expect(jobs["spacy-image"]?.permissions).toBeUndefined();
    expect(jobs["application-images"]?.permissions).toBeUndefined();
    for (const name of ["spacy-image", "application-images"]) {
      const steps = jobs[name]?.steps ?? [];
      const cleanupIndex = steps.findIndex(
        (step) => step.run === "pnpm container:cleanup-image-artifacts",
      );
      const recordIndex = steps.findIndex(
        (step) =>
          step.uses === "actions/upload-artifact@v7" &&
          String(step.with?.name).includes("verification-record-"),
      );
      expect(cleanupIndex).toBeGreaterThan(-1);
      expect(recordIndex).toBeGreaterThan(cleanupIndex);
    }
    for (const name of [
      "integration",
      "e2e-dev",
      "release-e2e",
      "container-lifecycle",
    ]) {
      const steps = jobs[name]?.steps ?? [];
      const runIndex = steps.findIndex((step) =>
        step.run?.startsWith("pnpm ci:verification:run"),
      );
      const cleanupIndex = steps.findIndex(
        (step) =>
          step.name === "Clean consumed candidate artifact root" &&
          step.if === "always()" &&
          step.run === "pnpm container:cleanup-image-artifacts",
      );
      const recordIndex = steps.findIndex(
        (step) =>
          step.uses === "actions/upload-artifact@v7" &&
          String(step.with?.name).includes("verification-record-"),
      );
      expect(cleanupIndex).toBeGreaterThan(runIndex);
      expect(recordIndex).toBeGreaterThan(cleanupIndex);
    }
  });

  it("keeps advisory Buildx caches isolated by build family", () => {
    const jobs = workflow.jobs ?? {};
    for (const [jobName, family] of [
      ["application-images", "application"],
      ["spacy-image", "spacy"],
    ] as const) {
      const steps = jobs[jobName]?.steps ?? [];
      const restore = steps.find(
        (step) => step.uses === "actions/cache/restore@v6",
      );
      expect(restore).toMatchObject({
        "continue-on-error": true,
        with: {
          key: `buildx-${"${{ runner.os }}"}-${family}-${"${{ github.sha }}"}`,
          path: `.cache/buildx/${family}`,
          "restore-keys": `buildx-${"${{ runner.os }}"}-${family}-\n`,
        },
      });
      const run = steps.find((step) =>
        step.run?.startsWith("pnpm ci:verification:run"),
      );
      expect(run?.env).toMatchObject({
        CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
      });
      const finalize = steps.find(
        (step) => step.id === "finalize-buildx-cache",
      );
      expect(finalize).toMatchObject({
        "continue-on-error": true,
        run: `pnpm ci:buildx-cache:finalize ${family}`,
      });
      const save = steps.find((step) => step.uses === "actions/cache/save@v6");
      expect(save?.["continue-on-error"]).toBe(true);
      expect(save?.if).toContain("success()");
      expect(save?.if).toContain(
        "steps.finalize-buildx-cache.outcome == 'success'",
      );
      expect(save?.if).toContain("github.ref == 'refs/heads/main'");
      expect(save?.with).toMatchObject({
        key: `buildx-${"${{ runner.os }}"}-${family}-${"${{ github.sha }}"}`,
        path: `.cache/buildx/${family}`,
      });
      expect(JSON.stringify(steps)).not.toContain(
        family === "application"
          ? ".cache/buildx/spacy"
          : ".cache/buildx/application",
      );
    }
  });

  it("retains only native failed E2E diagnostics", () => {
    for (const name of ["e2e-dev", "release-e2e"]) {
      const run = workflow.jobs?.[name]?.steps?.find((step) =>
        step.run?.startsWith("pnpm ci:verification:run"),
      );
      const diagnostic = workflow.jobs?.[name]?.steps?.find(
        (step) => step.name === "Upload failed E2E diagnostics",
      );
      expect(diagnostic?.if).toBe("failure()");
      expect(diagnostic?.uses).toBe("actions/upload-artifact@v7");
      expect(diagnostic?.with?.["if-no-files-found"]).toBe("ignore");
      expect(run?.env?.CAT_E2E_ARTIFACT_ROOT).toBe(
        "/tmp/cat-e2e-${{ github.run_id }}",
      );
      const paths = String(diagnostic?.with?.path);
      expect(paths).toContain(
        "/tmp/cat-e2e-${{ github.run_id }}/**/playwright/**",
      );
      expect(paths).toContain(
        "/tmp/cat-e2e-${{ github.run_id }}/**/playwright-report/**",
      );
      expect(paths).toContain("/**/playwright/.auth/**");
      expect(paths).not.toMatch(/\.log|e2e-refs|attestation/);
    }
  });

  it("keeps the source lane outer timeout above its sequential long-node budget", () => {
    const outerBudget =
      (workflow.jobs?.["source-artifacts"]?.["timeout-minutes"] ?? 0) * 60_000;
    const longNodeBudget =
      verificationExecutorTimeoutBudget.long +
      verificationExecutorCleanupHeadroomMs.handlerSettlement +
      verificationExecutorCleanupHeadroomMs.nodeCleanup;

    expect(outerBudget).toBe(110 * 60_000);
    expect(outerBudget).toBeGreaterThan(longNodeBudget * 2);
  });

  it("publishes original candidates only after aggregation on main", () => {
    const release = workflow.jobs?.["release-images"];
    expect(release?.needs).toEqual(["aggregate"]);
    expect(release?.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(release?.permissions).toEqual({
      contents: "read",
      packages: "write",
    });
    const commands = (release?.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");
    expect(commands).toContain("pnpm ci:verification:release");
    expect(commands).not.toMatch(/docker build|build-push-action/);
    expect(
      release?.steps?.some(
        (step) =>
          step.uses === "actions/download-artifact@v8" &&
          String(step.with?.name).startsWith("validated-release-"),
      ),
    ).toBe(true);
    const aggregate = workflow.jobs?.aggregate;
    expect(
      aggregate?.steps?.some(
        (step) =>
          step.uses === "actions/download-artifact@v8" &&
          String(step.with?.pattern).startsWith("candidate-*"),
      ),
    ).toBe(true);
    expect(
      aggregate?.steps?.some(
        (step) =>
          step.uses === "actions/upload-artifact@v7" &&
          String(step.with?.name).startsWith("validated-release-"),
      ),
    ).toBe(true);
    expect(
      aggregate?.steps?.find(
        (step) =>
          step.run ===
          "pnpm ci:verification:aggregate /tmp/verification-records",
      )?.env?.CAT_VERIFICATION_JOB_RESULTS,
    ).toContain("toJSON(needs)");
  });

  it("passes fixed subcommands directly through every package-script boundary", () => {
    const commandSteps = Object.values(workflow.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.run !== undefined),
    );
    const fixedSubcommandSteps = commandSteps.filter((step) =>
      /^pnpm (?:ci:verification:(?:run|aggregate)|ci:buildx-cache:finalize)\b/.test(
        step.run!,
      ),
    );

    expect(fixedSubcommandSteps.length).toBeGreaterThan(0);
    for (const step of fixedSubcommandSteps) {
      expect(step.run).not.toContain(" -- ");
    }
  });

  it("keeps package writes and registry login out of untrusted jobs", () => {
    const jobs = workflow.jobs ?? {};
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "release-images") continue;
      expect(job.permissions?.packages).toBeUndefined();
      expect(
        job.steps?.some((step) =>
          step.uses?.startsWith("docker/login-action@"),
        ),
      ).toBe(false);
      expect(
        job.steps?.some(
          (step) =>
            step.run?.includes("ci:verification:release") === true ||
            step.run?.includes("release:images") === true ||
            step.run?.includes("docker push") === true,
        ),
      ).toBe(false);
    }
  });

  it("uses the integrity-aware Node and pnpm composite action", () => {
    const setupSteps = setupNodePnpmAction.runs?.steps ?? [];
    expect(setupNodePnpmAction.runs?.using).toBe("composite");
    expect(setupSteps).toContainEqual(
      expect.objectContaining({ run: "pnpm ci:install" }),
    );
    for (const job of Object.values(workflow.jobs ?? {})) {
      expect(
        (job.steps ?? []).some(
          (step) => step.uses === "./.github/actions/setup-node-pnpm",
        ),
      ).toBe(true);
      expect(
        (job.steps ?? []).some((step) =>
          step.uses?.startsWith("pnpm/action-setup@"),
        ),
      ).toBe(false);
    }
  });

  it("injects signed remote cache identity only into trusted Turbo consumers", () => {
    const jobs = workflow.jobs ?? {};
    for (const name of [
      "quality",
      "source-artifacts",
      "application-images",
      "integration",
    ]) {
      const run = jobs[name]?.steps?.find((step) =>
        step.run?.startsWith("pnpm ci:verification:run"),
      );
      expect(run?.env, name).toMatchObject(trustedMainRemoteCacheEnvironment);
    }

    for (const [name, job] of Object.entries(jobs)) {
      for (const step of job.steps ?? []) {
        const hasRemoteIdentity = Object.keys(
          trustedMainRemoteCacheEnvironment,
        ).some((variable) => step.env?.[variable] !== undefined);
        if (!hasRemoteIdentity) continue;
        expect([
          "quality",
          "source-artifacts",
          "application-images",
          "integration",
        ]).toContain(name);
        expect(step.env).toMatchObject(trustedMainRemoteCacheEnvironment);
      }
    }

    const source = readFileSync(
      resolve(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    expect(source).not.toMatch(/TURBO_(?:CACHE_WORKERS|REMOTE_CACHE_TIMEOUT)/);
    expect(source).not.toMatch(/--(?:cache-workers|remote-cache-timeout)/);
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
        groups?: Record<
          string,
          {
            "applies-to"?: string;
            patterns?: string[];
            "update-types"?: string[];
          }
        >;
        ignore?: Array<{ "dependency-name"?: string }>;
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
    ).toEqual(["npm", "docker", "docker", "uv", "github-actions"]);

    const npm = dependabot.updates?.find(
      (update) => update["package-ecosystem"] === "npm",
    );
    expect(npm?.directory).toBe("/");
    expect(npm?.groups).toEqual({
      "aws-sdk": compatibilityCohort(["@aws-sdk/*"]),
      "drizzle-core": compatibilityCohort(["drizzle-kit", "drizzle-orm"]),
      orpc: compatibilityCohort(["@orpc/*"]),
      playwright: compatibilityCohort(["playwright", "@playwright/*"]),
      vitest: compatibilityCohort(["vitest", "@vitest/*"]),
      "vue-core": compatibilityCohort(["vue", "@vue/compiler-*"]),
      vueuse: compatibilityCohort(["@vueuse/*"]),
    });

    const containerImages = dependabot.updates?.filter(
      (update) => update["package-ecosystem"] === "docker",
    );
    expect(containerImages?.map((update) => update.directory)).toEqual([
      "/.devcontainer",
      "/apps/spacy-server",
    ]);
    const devcontainerImages = containerImages?.find(
      (update) => update.directory === "/.devcontainer",
    );
    expect(devcontainerImages?.ignore).toContainEqual({
      "dependency-name": "node",
    });
    expect(
      containerImages?.find(
        (update) => update.directory === "/apps/spacy-server",
      )?.ignore,
    ).toBeUndefined();

    const uv = dependabot.updates?.find(
      (update) => update["package-ecosystem"] === "uv",
    );
    expect(uv?.directory).toBe("/apps/spacy-server");

    expect(
      dependabot.updates?.filter(
        (update) => update["package-ecosystem"] === "github-actions",
      ),
    ).toHaveLength(1);
    expect(
      dependabot.updates?.find(
        (update) => update["package-ecosystem"] === "github-actions",
      )?.groups,
    ).toBeUndefined();
  });

  it("separates Python compatibility from the exact deployed patch for native uv updates", () => {
    const pythonVersion = String(
      workflow.jobs?.quality?.steps?.find((step) =>
        step.uses?.startsWith("astral-sh/setup-uv@"),
      )?.with?.["python-version"],
    );
    expect(pythonVersion).toMatch(/^3\.12\.\d+$/);
    const [major, minor] = pythonVersion.split(".").map(Number);
    const supportedRange = `>=${major}.${minor},<${major}.${minor! + 1}`;
    expect(
      readFileSync(resolve(root, "apps/spacy-server/pyproject.toml"), "utf8"),
    ).toContain(`requires-python = "${supportedRange}"`);
    expect(
      readFileSync(resolve(root, "apps/spacy-server/uv.lock"), "utf8"),
    ).toContain(`requires-python = "==${major}.${minor}.*"`);

    const spacyDockerfile = readFileSync(
      resolve(root, "apps/spacy-server/Dockerfile"),
      "utf8",
    );
    expect(spacyDockerfile.match(/^FROM python:/gm)).toHaveLength(2);
    expect(spacyDockerfile).not.toMatch(
      new RegExp(`^FROM python:(?!${pythonVersion}-)`, "m"),
    );
    expect(
      readFileSync(resolve(root, ".devcontainer/Dockerfile"), "utf8"),
    ).toContain(`UV_PYTHON=${pythonVersion}`);
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
