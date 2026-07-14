import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
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
} from "./image-builder.ts";

const imageId = (suffix: string): string => `sha256:${suffix.repeat(64)}`;
const execFileAsync = promisify(execFile);

const imageBuilderRunner = (
  images: Partial<Record<"standalone" | "runtime", string>>,
) =>
  vi.fn(async (_command, args) => {
    if (args[0] === "image" && args[1] === "ls") return { stdout: "" };
    if (args[0] === "build") {
      const target = args[args.indexOf("--target") + 1] as
        | "standalone"
        | "runtime";
      const output = args[args.indexOf("--iidfile") + 1];
      const image = images[target];
      if (image === undefined) throw new Error(`failed ${target}`);
      if (output === undefined) throw new Error("missing iidfile");
      writeFileSync(output, `${image}\n`);
    }
    return { stdout: "" };
  });

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
    expect(
      Object.keys(appManifest.scripts ?? {}).filter((name) =>
        name.startsWith("docker:"),
      ),
    ).toEqual([]);
  });

  it("builds both final targets by default and returns their immutable local IDs", async () => {
    const run = imageBuilderRunner({
      runtime: imageId("b"),
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
      ],
    });

    expect(
      vi
        .mocked(run)
        .mock.calls.filter(([, args]) => args[0] === "build")
        .map(([, args]) => args[args.indexOf("--target") + 1]),
    ).toEqual(["standalone", "runtime"]);
    expect(
      vi
        .mocked(run)
        .mock.calls.some(([, args]) =>
          args.some((argument) => /playwright/i.test(argument)),
        ),
    ).toBe(false);
    const builds = vi
      .mocked(run)
      .mock.calls.filter(([, args]) => args[0] === "build")
      .map(([, args]) => args);
    expect(builds.every((args) => args.includes("--iidfile"))).toBe(true);
    expect(builds.some((args) => args.includes("--tag"))).toBe(false);
    expect(
      new Set(builds.map((args) => args[args.indexOf("--iidfile") + 1])).size,
    ).toBe(2);
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
      vi.mocked(run).mock.calls.filter(([, args]) => args[0] === "build"),
    ).toHaveLength(1);
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

  it("writes only the machine-readable build result through its CLI interface", async () => {
    const output: string[] = [];
    const run = imageBuilderRunner({ standalone: imageId("d") });

    await runImageBuildCli({
      args: ["--target", "standalone"],
      buildId: "contract",
      env: {},
      run,
      signal: new AbortController().signal,
      write: (value) => output.push(value),
    });

    expect(JSON.parse(output.join(""))).toEqual({
      images: [{ imageId: imageId("d"), target: "standalone" }],
    });
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
      .mock.calls.find(([, args]) => args[0] === "build")?.[1];
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
      if (args[0] === "build") {
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

  it("keeps CLI stdout to one JSON value while forwarding child progress to stderr", async () => {
    const directory = join(
      tmpdir(),
      `cat-image-builder-${process.pid}-${Date.now()}`,
    );
    const docker = join(directory, "docker");
    const image = imageId("1");
    mkdirSync(directory);
    writeFileSync(
      docker,
      `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nif (args[0] === 'image' && args[1] === 'ls') process.exit(0);\nif (args[0] === 'build') {\n  require('node:fs').writeFileSync(args[args.indexOf('--iidfile') + 1], '${image}\\n');\n  process.stdout.write('build progress\\n');\n  process.exit(0);\n}\nif (args[0] === 'image' && args[1] === 'rm') process.exit(0);\nprocess.exit(1);\n`,
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

      expect(JSON.parse(result.stdout)).toEqual({
        images: [{ imageId: image, target: "standalone" }],
      });
      expect(result.stderr).toContain("build progress");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
