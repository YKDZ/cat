import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");

type WorkflowStep = {
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

describe("CI configuration contract", () => {
  it("runs both complete secret-free gates for every pull request", () => {
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
      checkAll?.steps?.some((step) => step.run?.includes("pnpm check:all")),
    ).toBe(true);
    for (const job of [check, checkAll]) {
      expect(JSON.stringify(job)).not.toContain("secrets.");
      expect(JSON.stringify(job)).not.toMatch(
        new RegExp(["affected", "base-branch", "moon"].join("|"), "i"),
      );
    }
  });

  it("installs every configured Playwright browser from the workspace before check:all", () => {
    const steps = workflow.jobs?.["check-all"]?.steps ?? [];
    const installIndex = steps.findIndex((step) =>
      step.run?.includes("playwright install --with-deps chromium firefox"),
    );
    const checkAllIndex = steps.findIndex((step) =>
      step.run?.includes("pnpm check:all"),
    );

    expect(installIndex).toBeGreaterThan(-1);
    expect(checkAllIndex).toBeGreaterThan(installIndex);
    expect(steps[installIndex]?.run).toContain("pnpm exec playwright");
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
            step.uses === "actions/setup-node@v6" &&
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

  it("lets forks restore cache while only main and internal pull requests save it", () => {
    for (const name of ["check", "check-all"] as const) {
      const steps = workflow.jobs?.[name]?.steps ?? [];
      const restore = steps.find(
        (step) => step.uses === "actions/cache/restore@v4",
      );
      const save = steps.find((step) => step.uses === "actions/cache/save@v4");
      expect(restore?.if).toBeUndefined();
      expect(restore?.with?.path).toBe(".turbo");
      expect(save?.with?.path).toBe(".turbo");
      expect(save?.if).toContain("github.event_name != 'pull_request'");
      expect(save?.if).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
      expect(save?.with?.key).toContain("github.run_id");
      expect(save?.with?.key).toContain("github.run_attempt");
    }
  });

  it("publishes only images exported by the successful main-branch gate", () => {
    const checkAllSteps = workflow.jobs?.["check-all"]?.steps ?? [];
    const release = workflow.jobs?.["release-images"];
    const releaseSteps = release?.steps ?? [];

    expect(
      checkAllSteps.some(
        (step) =>
          step.uses === "actions/upload-artifact@v4" &&
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
          step.uses === "actions/download-artifact@v4" &&
          step.with?.name === "validated-images-${{ github.sha }}",
      ),
    ).toBe(true);
    const releaseCommands = releaseSteps
      .map((step) => step.run ?? "")
      .join("\n");
    expect(releaseCommands).toContain("sha256sum --check SHA256SUMS");
    expect(releaseCommands).toContain("manifest.json");
    expect(releaseCommands).toContain("docker image load");
    expect(releaseCommands).toContain(
      "docker image inspect --format '{{.Id}}' \"$image\"",
    );
    expect(releaseCommands).toContain(
      'docker image inspect --format \'{{ index .Config.Labels "org.opencontainers.image.version" }}\' "$image"',
    );
    expect(releaseCommands).not.toContain('\\"org.opencontainers.image');
    expect(releaseCommands).toContain("manifest.images['$target'].imageId");
    expect(releaseCommands).toContain("manifest.images['$target'].identity");
    expect(releaseCommands).not.toContain("cat-image-build-cat-validated-");
    expect(releaseCommands).toContain("scripts/release-image-tags.ts");
    expect(releaseCommands).not.toMatch(/docker (?:build|buildx build)/);
    expect(
      releaseSteps.some((step) => step.uses === "docker/build-push-action@v6"),
    ).toBe(false);
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
