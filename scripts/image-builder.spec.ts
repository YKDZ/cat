import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  buildReleaseImages,
  parseImageBuildArguments,
  runImageBuildCli,
  type ImageBuildCommandOptions,
} from "./image-builder.ts";

const imageId = (suffix: string): string => `sha256:${suffix.repeat(64)}`;
const execFileAsync = promisify(execFile);

const imageBuilderRunner = (
  images: Partial<Record<"standalone" | "runtime" | "spacy", string>>,
) =>
  vi.fn(
    async (
      _command: string,
      args: string[],
      _options: ImageBuildCommandOptions,
    ): Promise<{ stdout: string }> => {
      if (args[0] === "image" && args[1] === "ls") return { stdout: "" };
      if (args[0] === "buildx" && args[1] === "build") {
        const target = args[args.indexOf("--target") + 1] as
          | "standalone"
          | "runtime"
          | "spacy";
        const output = args[args.indexOf("--iidfile") + 1];
        const image = images[target];
        if (image === undefined) throw new Error(`failed ${target}`);
        if (output === undefined) throw new Error("missing iidfile");
        writeFileSync(output, `${image}\n`);
      }
      return { stdout: "" };
    },
  );

describe("release image builder", () => {
  it("is the only package-script image build entrypoint", () => {
    const root = resolve(import.meta.dirname, "..");
    const rootManifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const appManifest = JSON.parse(
      readFileSync(resolve(root, "apps/app/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(rootManifest.scripts?.["build:images"]).toBe(
      "node scripts/image-builder.ts",
    );
    expect(rootManifest.scripts?.["build:spacy-image"]).toBe(
      "node scripts/image-builder.ts --target spacy",
    );
    expect(
      Object.keys(appManifest.scripts ?? {}).filter((name) =>
        name.startsWith("docker:"),
      ),
    ).toEqual([]);
  });

  it("builds both final targets by default and returns their immutable local IDs", async () => {
    const run = imageBuilderRunner({
      runtime: imageId("b"),
      spacy: imageId("c"),
      standalone: imageId("a"),
    });

    await expect(
      buildReleaseImages({
        buildId: "contract",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      images: [
        { imageId: imageId("a"), target: "standalone" },
        { imageId: imageId("b"), target: "runtime" },
        { imageId: imageId("c"), target: "spacy" },
      ],
    });

    expect(
      vi
        .mocked(run)
        .mock.calls.filter(([, args]) => args[0] === "buildx")
        .map(([, args]) => args[args.indexOf("--target") + 1]),
    ).toEqual(["standalone", "runtime", "spacy"]);
    expect(
      vi
        .mocked(run)
        .mock.calls.some(([, args]) =>
          args.some((argument) => /playwright/i.test(argument)),
        ),
    ).toBe(false);
    const builds = vi
      .mocked(run)
      .mock.calls.filter(([, args]) => args[0] === "buildx")
      .map(([, args]) => args);
    expect(builds.every((args) => args.includes("--iidfile"))).toBe(true);
    expect(builds.every((args) => args.includes("--metadata-file"))).toBe(true);
    expect(builds.every((args) => args.includes("--load"))).toBe(true);
    expect(builds.every((args) => args.includes("--progress=quiet"))).toBe(
      true,
    );
    expect(builds.some((args) => args.includes("--tag"))).toBe(false);
    expect(
      new Set(builds.map((args) => args[args.indexOf("--iidfile") + 1])).size,
    ).toBe(3);
    expect(
      new Set(
        builds.map(
          (args) => args[args.indexOf("DEPLOYMENT_BUILD_ID=contract")],
        ),
      ),
    ).toEqual(new Set(["DEPLOYMENT_BUILD_ID=contract"]));
  });

  it("accepts one explicit target without building the other final image", async () => {
    const run = imageBuilderRunner({ runtime: imageId("c") });

    await expect(
      buildReleaseImages({
        buildId: "contract",
        env: {},
        run,
        signal: new AbortController().signal,
        targets: ["runtime"],
      }),
    ).resolves.toEqual({
      images: [{ imageId: imageId("c"), target: "runtime" }],
    });
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[0] === "buildx"),
    ).toHaveLength(1);
  });

  it("builds spaCy through its own Dockerfile and context", async () => {
    const run = imageBuilderRunner({ spacy: imageId("d") });

    await buildReleaseImages({
      buildId: "contract",
      env: {},
      run,
      signal: new AbortController().signal,
      targets: ["spacy"],
    });

    const build = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "buildx")?.[1];
    expect(build).toEqual(
      expect.arrayContaining([
        "--file",
        "apps/spacy-server/Dockerfile",
        "--target",
        "spacy",
        "apps/spacy-server",
      ]),
    );
  });

  it("accepts pnpm's argument separator before one explicit target", () => {
    expect(parseImageBuildArguments(["--", "--target", "runtime"])).toEqual([
      "runtime",
    ]);
  });

  it("rejects invalid or duplicate target arguments before invoking Docker", () => {
    expect(() => parseImageBuildArguments(["--target", "preview"])).toThrow(
      "Unknown image target",
    );
    expect(() =>
      parseImageBuildArguments(["--target", "runtime", "--target", "runtime"]),
    ).toThrow("Usage:");
  });

  it("reports a concise human-readable build result through its CLI interface", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const run = imageBuilderRunner({ standalone: imageId("d") });

    await runImageBuildCli({
      args: ["--target", "standalone"],
      buildId: "contract",
      env: {},
      run,
      signal: new AbortController().signal,
      write: (value) => output.push(value),
      writeError: (value) => errors.push(value),
    });

    expect(output.join("")).toContain("target=standalone");
    expect(output.join("")).toContain(`image=${imageId("d")}`);
    expect(errors).toEqual([]);
  });

  it("keeps each release target in an independent advisory local-cache scope", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cat-buildx-cache-"));
    const cacheRoot = join(cwd, ".cache");
    for (const target of ["standalone", "runtime", "spacy"]) {
      const scope = join(cacheRoot, "buildx", target);
      mkdirSync(scope, { recursive: true });
      writeFileSync(join(scope, "index.json"), "{}\n");
    }
    const run = imageBuilderRunner({
      runtime: imageId("8"),
      spacy: imageId("7"),
      standalone: imageId("9"),
    });

    try {
      await buildReleaseImages({
        buildId: "contract",
        cwd,
        env: {
          CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
          CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
          TURBO_REMOTE_CACHE_SIGNATURE_KEY: "signature",
          TURBO_TEAM: "team",
          TURBO_TOKEN: "token",
        },
        run,
        signal: new AbortController().signal,
      });
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }

    const builds = vi
      .mocked(run)
      .mock.calls.filter(([, args]) => args[0] === "buildx")
      .map(([, args]) => args);
    expect(builds).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          "--cache-to",
          `type=local,dest=${join(cwd, ".cache/buildx-next", "standalone")},mode=max,ignore-error=true`,
        ]),
        expect.arrayContaining([
          "--cache-to",
          `type=local,dest=${join(cwd, ".cache/buildx-next", "runtime")},mode=max,ignore-error=true`,
        ]),
      ]),
    );
    expect(builds.flat()).toEqual(
      expect.arrayContaining([
        "--secret",
        "id=turbo_team,env=TURBO_TEAM",
        "id=turbo_token,env=TURBO_TOKEN",
        "id=turbo_remote_cache_signature_key,env=TURBO_REMOTE_CACHE_SIGNATURE_KEY",
      ]),
    );
    expect(builds.flat()).toEqual(
      expect.arrayContaining([
        "--cache-from",
        `type=local,src=${join(cwd, ".cache/buildx", "standalone")}`,
        `type=local,src=${join(cwd, ".cache/buildx", "runtime")}`,
      ]),
    );
    expect(
      builds.flat().some((argument) => argument.startsWith("TURBO_TOKEN=")),
    ).toBe(false);
  });

  it("does not import a source cache scope without its OCI marker", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cat-buildx-cache-incomplete-"));
    const cacheRoot = join(cwd, ".cache");
    const sourceScope = join(cacheRoot, "buildx", "standalone");
    mkdirSync(sourceScope, { recursive: true });
    const run = imageBuilderRunner({ standalone: imageId("8") });

    try {
      await buildReleaseImages({
        buildId: "contract",
        cwd,
        env: {
          CAT_BUILDX_CACHE_SOURCE: ".cache/buildx",
          CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        },
        run,
        signal: new AbortController().signal,
        targets: ["standalone"],
      });
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }

    const build = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "buildx")?.[1];
    expect(build).toBeDefined();
    expect(build).not.toContain("--cache-from");
    expect(build).toEqual(
      expect.arrayContaining([
        "--cache-to",
        `type=local,dest=${join(cwd, ".cache/buildx-next", "standalone")},mode=max,ignore-error=true`,
      ]),
    );
  });

  it("enables Buildx metadata warnings for every child build", async () => {
    const run = imageBuilderRunner({ standalone: imageId("8") });

    await buildReleaseImages({
      buildId: "contract",
      env: {},
      run,
      signal: new AbortController().signal,
      targets: ["standalone"],
    });

    const buildOptions = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "buildx")?.[2];
    expect(buildOptions?.env.BUILDX_METADATA_WARNINGS).toBe("1");
  });

  it("reports Buildx warnings alongside the target summary", async () => {
    const reports: string[] = [];
    const run = imageBuilderRunner({ standalone: imageId("7") });
    vi.mocked(run).mockImplementation(async (_command, args) => {
      if (args[0] === "image" && args[1] === "ls") return { stdout: "" };
      if (args[0] === "buildx" && args[1] === "build") {
        const iidfile = args[args.indexOf("--iidfile") + 1];
        const metadataFile = args[args.indexOf("--metadata-file") + 1];
        if (iidfile === undefined || metadataFile === undefined)
          throw new Error("missing Buildx output paths");
        writeFileSync(iidfile, `${imageId("7")}\n`);
        writeFileSync(
          metadataFile,
          JSON.stringify({ "buildx.build.warnings": [{ detail: "notice" }] }),
        );
      }
      return { stdout: "" };
    });

    await buildReleaseImages({
      buildId: "contract",
      env: {},
      report: (message) => reports.push(message),
      run,
      signal: new AbortController().signal,
      targets: ["standalone"],
    });

    expect(reports.join("")).toContain("image target=standalone");
    expect(reports.join("")).toContain("image warning target=standalone");
  });

  it("replays plain Buildx history before surfacing a failed build", async () => {
    const run = imageBuilderRunner({});
    const errors: string[] = [];
    vi.mocked(run).mockImplementation(async (_command, args) => {
      if (args[0] === "image" && args[1] === "ls") return { stdout: "" };
      if (args[0] === "buildx" && args[1] === "build") {
        throw new Error("failed build");
      }
      if (args.join(" ").includes("history ls"))
        return { stdout: "latest-failed-ref\nolder-failed-ref\n" };
      if (args.join(" ").includes("history logs")) {
        return { stdout: "#1 [internal] failed build history\n" };
      }
      return { stdout: "" };
    });

    await expect(
      buildReleaseImages({
        buildId: "contract",
        env: {},
        reportError: (message) => errors.push(message),
        run,
        signal: new AbortController().signal,
        targets: ["standalone"],
      }),
    ).rejects.toThrow("failed build");

    expect(vi.mocked(run).mock.calls.map(([, args]) => args)).toContainEqual([
      "buildx",
      "history",
      "ls",
      "--filter",
      "status=error",
      "--format",
      "{{.Ref}}",
    ]);
    expect(vi.mocked(run).mock.calls.map(([, args]) => args)).toContainEqual([
      "buildx",
      "history",
      "logs",
      "--progress=plain",
      "latest-failed-ref",
    ]);
    const historyLogsOptions = vi
      .mocked(run)
      .mock.calls.find(([, args]) =>
        args.join(" ").includes("history logs"),
      )?.[2];
    expect(historyLogsOptions?.stdio).toBe("pipe");
    expect(errors).toEqual(["#1 [internal] failed build history\n"]);
  });

  it("disables every external cache argument for invalid cache paths", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cat-buildx-cache-invalid-"));
    const reports: string[] = [];
    const run = imageBuilderRunner({ standalone: imageId("6") });

    try {
      await buildReleaseImages({
        buildId: "contract",
        cwd,
        env: {
          CAT_BUILDX_CACHE_SOURCE: ".cache/buildx,mode=max",
          CAT_BUILDX_CACHE_OUTPUT: ".cache/buildx-next",
        },
        report: (message) => reports.push(message),
        run,
        signal: new AbortController().signal,
        targets: ["standalone"],
      });
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }

    const build = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "buildx")?.[1];
    expect(build).toBeDefined();
    expect(build).not.toContain("--cache-from");
    expect(build).not.toContain("--cache-to");
    expect(reports.join("")).toContain("container cache warning");
    expect(reports.join("")).toContain(
      "external-cache-input=unavailable external-cache-output=not-configured",
    );
  });

  it("rolls back only images created by this invocation when a later target fails", async () => {
    const standalone = imageId("e");
    const run = imageBuilderRunner({ standalone });

    await expect(
      buildReleaseImages({
        buildId: "contract",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("failed runtime");

    expect(vi.mocked(run).mock.calls.map(([, args]) => args)).toContainEqual([
      "image",
      "rm",
      "--force",
      standalone,
    ]);
    const build = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "buildx")?.[1];
    if (build === undefined) throw new Error("Expected a Docker build call");
    const iidfile = build[build.indexOf("--iidfile") + 1];
    if (iidfile === undefined) throw new Error("Expected an iidfile");
    expect(existsSync(iidfile)).toBe(false);
  });

  it("does not delete an image that existed before a partial build failure", async () => {
    const standalone = imageId("f");
    const run = imageBuilderRunner({ standalone });
    vi.mocked(run).mockImplementation(async (_command, args) => {
      if (args[0] === "image" && args[1] === "ls") {
        return { stdout: `${standalone}\n` };
      }
      if (args[0] === "buildx" && args[1] === "build") {
        const target = args[args.indexOf("--target") + 1];
        if (target === "runtime") throw new Error("failed runtime");
        const output = args[args.indexOf("--iidfile") + 1];
        if (output === undefined) throw new Error("missing iidfile");
        writeFileSync(output, `${standalone}\n`);
      }
      return { stdout: "" };
    });

    await expect(
      buildReleaseImages({
        buildId: "contract",
        env: {},
        run,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("failed runtime");

    expect(
      vi
        .mocked(run)
        .mock.calls.some(
          ([, args]) =>
            args[0] === "image" &&
            args[1] === "rm" &&
            args.includes(standalone),
        ),
    ).toBe(false);
  });

  it("prints one concise image summary and suppresses successful Buildx progress", async () => {
    const directory = join(
      tmpdir(),
      `cat-image-builder-${process.pid}-${Date.now()}`,
    );
    const docker = join(directory, "docker");
    const image = imageId("1");
    mkdirSync(directory);
    writeFileSync(
      docker,
      `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nif (args[0] === 'image' && args[1] === 'ls') process.exit(0);\nif (args[0] === 'buildx' && args[1] === 'build') {\n  require('node:fs').writeFileSync(args[args.indexOf('--iidfile') + 1], '${image}\\n');\n  process.stdout.write('build progress\\n');\n  process.exit(0);\n}\nif (args[0] === 'image' && args[1] === 'rm') process.exit(0);\nprocess.exit(1);\n`,
    );
    chmodSync(docker, 0o755);

    try {
      const result = await execFileAsync(
        process.execPath,
        ["scripts/image-builder.ts", "--target", "standalone"],
        {
          cwd: resolve(import.meta.dirname, ".."),
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        },
      );

      expect(result.stdout).toContain(`target=standalone`);
      expect(result.stdout).toContain(`image=${image}`);
      expect(result.stdout).not.toContain("build progress");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("writes failed Buildx history to CLI stderr without polluting stdout", async () => {
    const directory = join(
      tmpdir(),
      `cat-image-builder-history-${process.pid}-${Date.now()}`,
    );
    const docker = join(directory, "docker");
    mkdirSync(directory);
    writeFileSync(
      docker,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'image' && args[1] === 'ls') process.exit(0);
if (args[0] === 'buildx' && args[1] === 'build') process.exit(1);
if (args.join(' ').includes('history ls')) process.stdout.write('failed-build\\n');
if (args.join(' ').includes('history logs')) process.stdout.write('plain Buildx failure\\n');
`,
    );
    chmodSync(docker, 0o755);

    try {
      await expect(
        execFileAsync(
          process.execPath,
          ["scripts/image-builder.ts", "--target", "standalone"],
          {
            cwd: resolve(import.meta.dirname, ".."),
            env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
          },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("plain Buildx failure"),
        stdout: "",
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
