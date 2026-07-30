import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeImageChecksums } from "./ci-check-all.ts";
import {
  publishImageArtifacts,
  verifyAndLoadImageArtifacts,
} from "./image-artifacts.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";
const temporaryDirectories: string[] = [];
const image = (suffix: string): string => `sha256:${suffix.repeat(64)}`;

const writeManifest = async (
  versionLabel = "cat-validated-contract",
  runtimeVersionLabel = versionLabel,
): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cat-image-artifacts-"));
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      images: {
        standalone: {
          imageId: image("a"),
          target: "standalone",
          identity: {
            command: "prepare-and-start",
            description: "CAT standalone application with database preparation",
            versionLabel,
          },
        },
        runtime: {
          imageId: image("b"),
          target: "runtime",
          identity: {
            command: "start-only",
            description: "CAT start-only application runtime",
            versionLabel: runtimeVersionLabel,
          },
        },
      },
    })}\n`,
  );
  return directory;
};

const writeValidatedArtifact = async (): Promise<string> => {
  const directory = await writeManifest();
  await writeFile(join(directory, "standalone.tar"), "standalone image\n");
  await writeFile(join(directory, "runtime.tar"), "runtime image\n");
  await writeImageChecksums(directory, () => undefined);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("validated image release", () => {
  it("writes checksums from real artifact bytes", async () => {
    const directory = await writeValidatedArtifact();
    const sums = await readFile(join(directory, "SHA256SUMS"), "utf8");

    expect(sums).toMatch(/^[a-f0-9]{64}  manifest\.json$/m);
    expect(sums).toMatch(/^[a-f0-9]{64}  standalone\.tar$/m);
    expect(sums).toMatch(/^[a-f0-9]{64}  runtime\.tar$/m);
  });

  it("rejects changed artifact bytes before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    await writeFile(join(directory, "runtime.tar"), "changed\n");
    const run = vi.fn(
      async (_command: string, _args: string[]): Promise<string> => "",
    );

    await expect(
      verifyAndLoadImageArtifacts(directory, { run }),
    ).rejects.toThrow("checksum does not match runtime.tar");
    expect(run).not.toHaveBeenCalled();
  });

  it("loads and inspects every manifest identity before reporting success", async () => {
    const directory = await writeValidatedArtifact();
    const reports: string[] = [];
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return "loaded\n";
      const target = args.at(-1) === image("a") ? "standalone" : "runtime";
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "cat-validated-contract\n";
      if (format?.includes("description")) {
        return target === "standalone"
          ? "CAT standalone application with database preparation\n"
          : "CAT start-only application runtime\n";
      }
      if (format === "{{ index .Config.Cmd 0 }}") {
        return target === "standalone" ? "prepare-and-start\n" : "start-only\n";
      }
      throw new Error(`Unexpected Docker call ${args.join(" ")}`);
    });

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        report: (message) => reports.push(message),
        run,
      }),
    ).resolves.toMatchObject({ schemaVersion: 1 });

    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "load"),
    ).toHaveLength(2);
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "inspect"),
    ).toHaveLength(8);
    expect(reports.join("")).toContain("target=standalone");
    expect(reports.join("")).toContain("target=runtime");
  });

  it("rejects a loaded image identity mismatch", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return "loaded\n";
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "unexpected\n";
      return "ignored\n";
    });

    await expect(
      verifyAndLoadImageArtifacts(directory, { run }),
    ).rejects.toThrow("Loaded standalone image does not match its manifest");
  });

  it("propagates Docker load failures", async () => {
    const directory = await writeValidatedArtifact();

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        run: async () => {
          throw new Error("docker unavailable");
        },
      }),
    ).rejects.toThrow("docker unavailable");
  });

  it("publishes both immutable targets with the app semver, not the validation label", async () => {
    const directory = await writeManifest();
    const run = vi.fn(
      async (_command: string, _args: string[]): Promise<string> => "",
    );

    await publishImageArtifacts(directory, {
      env: {
        GITHUB_SHA: revision,
        IMAGE: "ghcr.io/acme/cat",
      },
      readApplicationManifest: async () => ({ version: "1.2.3" }),
      report: vi.fn(),
      run,
    });

    const tags = vi
      .mocked(run)
      .mock.calls.filter(([, args]) => args[1] === "tag")
      .map(([, args]) => args[3]);
    expect(tags).toEqual([
      "ghcr.io/acme/cat:1.2.3",
      "ghcr.io/acme/cat:sha-0123456789ab",
      "ghcr.io/acme/cat:latest",
      "ghcr.io/acme/cat:1.2.3-runtime",
      "ghcr.io/acme/cat:sha-0123456789ab-runtime",
      "ghcr.io/acme/cat:latest-runtime",
    ]);
  });

  it("rejects an invalid application version before tagging", async () => {
    const directory = await writeManifest();
    const run = vi.fn(async () => "");

    await expect(
      publishImageArtifacts(directory, {
        env: { GITHUB_SHA: revision, IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "not-a-semver" }),
        run,
      }),
    ).rejects.toThrow("Invalid release version");
    expect(run).not.toHaveBeenCalled();
  });

  it("requires both release targets to carry the same validated identity label", async () => {
    const directory = await writeManifest(
      "cat-validated-one",
      "cat-validated-two",
    );

    await expect(
      publishImageArtifacts(directory, {
        env: { GITHUB_SHA: revision, IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "1.2.3" }),
        run: async () => "",
      }),
    ).rejects.toThrow("inconsistent version labels");
  });
});
