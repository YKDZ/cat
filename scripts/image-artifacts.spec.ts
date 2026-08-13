import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCandidateIdentity } from "./candidate-identity.ts";
import {
  publishImageArtifacts,
  verifyAndLoadImageArtifacts,
  verifyAndLoadImageFamilyArtifacts,
} from "./image-artifacts.ts";
import {
  candidateFamilyArtifactIdentity,
  cleanupCandidateImageArtifacts,
  combineCandidateImageFamilies,
  createCandidateImageArtifactRoot,
  initializeCandidateImageArtifacts,
  writeCandidateImageChecksums,
  writeCandidateImageBundles,
  writeCandidateImageFamily,
} from "./image-candidates.ts";
import { buildCandidateImageFamily } from "./image-family-builder.ts";
import { createVerificationPlan } from "./verification-plan.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";
const temporaryDirectories: string[] = [];
const imageConfig = (suffix: string): Buffer =>
  Buffer.from(JSON.stringify({ fixture: suffix }) + "\n");
const image = (suffix: string): string =>
  `sha256:${createHash("sha256").update(imageConfig(suffix)).digest("hex")}`;
const tarHeader = (name: string, size: number): Buffer => {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("0", 156, 1, "ascii");
  return header;
};
const writeDockerSaveTar = async (
  path: string,
  suffixes: string[],
): Promise<void> => {
  const configs = suffixes.map((suffix) => ({
    bytes: imageConfig(suffix),
    name: `${image(suffix).slice("sha256:".length)}.json`,
  }));
  const manifest = Buffer.from(
    JSON.stringify(
      configs.map((config) => ({
        Config: config.name,
        Layers: [],
        RepoTags: null,
      })),
    ) + "\n",
  );
  const entries = [...configs, { bytes: manifest, name: "manifest.json" }];
  const blocks = entries.flatMap(({ bytes, name }) => [
    tarHeader(name, bytes.length),
    bytes,
    Buffer.alloc((512 - (bytes.length % 512)) % 512),
  ]);
  await writeFile(path, Buffer.concat([...blocks, Buffer.alloc(1024)]));
};
const candidateIdentity = {
  commitIdentity: revision,
  planIdentity: "complete-verification-contract",
  releaseIdentity: "cat-validated-contract",
  runIdentity: "run-123",
};
const ownerToken = "candidate-owner-contract-token";
const loadedImages = (args: string[]): string =>
  args.at(-1)?.endsWith("application-images.tar") === true
    ? `Loaded image ID: ${image("a")}\nLoaded image ID: ${image("b")}\n`
    : `Loaded image ID: ${image("c")}\n`;

describe("candidate family artifact identity", () => {
  it("canonically binds the bundle checksum and every exact family image ID", () => {
    const checksum = "a".repeat(64);
    const identity = candidateFamilyArtifactIdentity({
      ...candidateIdentity,
      candidates: {
        runtime: {
          bundle: { file: "application-images.tar", sha256: checksum },
          capability: {
            command: "start-only",
            description: "CAT start-only application runtime",
          },
          imageId: image("b"),
          releaseIdentity: candidateIdentity.releaseIdentity,
          target: "runtime",
        },
        standalone: {
          bundle: { file: "application-images.tar", sha256: checksum },
          capability: {
            command: "prepare-and-start",
            description: "CAT standalone application with database preparation",
          },
          imageId: image("a"),
          releaseIdentity: candidateIdentity.releaseIdentity,
          target: "standalone",
        },
      },
      family: "application",
      schemaVersion: 2,
    });

    expect(JSON.parse(identity)).toEqual({
      bundleSha256: checksum,
      family: "application",
      imageIds: {
        runtime: image("b"),
        standalone: image("a"),
      },
      schemaVersion: 1,
    });
  });
});

const writeManifest = async (
  versionLabel = "cat-validated-contract",
  runtimeVersionLabel = versionLabel,
): Promise<string> => {
  const { directory } = await createCandidateImageArtifactRoot(ownerToken);
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      schemaVersion: 2,
      commitIdentity: candidateIdentity.commitIdentity,
      planIdentity: candidateIdentity.planIdentity,
      releaseIdentity: versionLabel,
      runIdentity: candidateIdentity.runIdentity,
      candidates: {
        standalone: {
          bundle: { file: "application-images.tar", sha256: "a".repeat(64) },
          capability: {
            command: "prepare-and-start",
            description: "CAT standalone application with database preparation",
          },
          imageId: image("a"),
          releaseIdentity: versionLabel,
          target: "standalone",
        },
        runtime: {
          bundle: { file: "application-images.tar", sha256: "a".repeat(64) },
          capability: {
            command: "start-only",
            description: "CAT start-only application runtime",
          },
          imageId: image("b"),
          releaseIdentity: runtimeVersionLabel,
          target: "runtime",
        },
        spacy: {
          bundle: { file: "spacy-image.tar", sha256: "b".repeat(64) },
          capability: {
            command: "provision-and-serve",
            description: "CAT spaCy language analysis runtime",
          },
          imageId: image("c"),
          releaseIdentity: versionLabel,
          target: "spacy",
        },
      },
    }) + "\n",
  );
  return directory;
};

const writeValidatedArtifact = async (): Promise<string> => {
  const directory = await writeManifest();
  await writeDockerSaveTar(join(directory, "application-images.tar"), [
    "a",
    "b",
  ]);
  await writeDockerSaveTar(join(directory, "spacy-image.tar"), ["c"]);
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as {
    candidates: {
      runtime: { bundle: { sha256: string } };
      spacy: { bundle: { sha256: string } };
      standalone: { bundle: { sha256: string } };
    };
  };
  const checksum = async (file: string): Promise<string> =>
    createHash("sha256")
      .update(await readFile(join(directory, file)))
      .digest("hex");
  const applicationChecksum = await checksum("application-images.tar");
  manifest.candidates.standalone.bundle.sha256 = applicationChecksum;
  manifest.candidates.runtime.bundle.sha256 = applicationChecksum;
  manifest.candidates.spacy.bundle.sha256 = await checksum("spacy-image.tar");
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest) + "\n",
  );
  await writeCandidateImageChecksums(directory, ownerToken, () => undefined);
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
  it("creates owned roots explicitly and never claims a caller-supplied empty directory", async () => {
    const existing = await mkdtemp(join(tmpdir(), "cat-unowned-empty-"));
    temporaryDirectories.push(existing);

    await expect(
      initializeCandidateImageArtifacts(existing, ownerToken),
    ).rejects.toThrow("not owned");
    const owned = await createCandidateImageArtifactRoot(ownerToken);
    await cleanupCandidateImageArtifacts(owned.directory, owned.ownerToken);
    await expect(access(owned.directory)).rejects.toThrow();
  });

  it("resolves one candidate identity for family build and consumption", () => {
    const env = {
      CAT_CANDIDATE_RUN_ID: "run-public",
      GITHUB_SHA: revision,
    };

    expect(
      resolveCandidateIdentity(env, {
        planIdentity: "complete-verification-contract",
      }),
    ).toEqual({
      commitIdentity: revision,
      planIdentity: "complete-verification-contract",
      releaseIdentity: `cat-validated-${revision}`,
      runIdentity: "run-public",
    });
    expect(() =>
      resolveCandidateIdentity(
        {
          ...env,
          CAT_CANDIDATE_RELEASE_IDENTITY: "release-one",
          DEPLOYMENT_BUILD_ID: "release-two",
        },
        { planIdentity: "complete-verification-contract" },
      ),
    ).toThrow("release identity");
  });

  it("round-trips independently built families with the minimum shared environment", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    temporaryDirectories.push(directory);
    const env = {
      CAT_CANDIDATE_RUN_ID: "run-public",
      CAT_IMAGE_CANDIDATE_DIR: directory,
      CAT_IMAGE_CANDIDATE_OWNER_TOKEN: ownerToken,
      GITHUB_SHA: revision,
    };
    const identity = resolveCandidateIdentity(env, {
      planIdentity: createVerificationPlan().digest,
    });
    const suffixByTarget = {
      runtime: "b",
      spacy: "c",
      standalone: "a",
    } as const;
    const buildRun = vi.fn(async (_command, args: string[]) => {
      if (args[0] === "image" && args[1] === "ls") {
        return { stderr: "", stdout: "" };
      }
      if (args[0] === "buildx" && args[1] === "build") {
        const target = args[
          args.indexOf("--target") + 1
        ] as keyof typeof suffixByTarget;
        const iidfile = args[args.indexOf("--iidfile") + 1];
        if (iidfile === undefined) throw new Error("missing iidfile");
        expect(args).toContain(
          `DEPLOYMENT_BUILD_ID=${identity.releaseIdentity}`,
        );
        await writeFile(iidfile, image(suffixByTarget[target]) + "\n");
        return { stderr: "", stdout: "" };
      }
      if (args[0] === "image" && args[1] === "save") {
        const output = args[args.indexOf("--output") + 1];
        if (output === undefined) throw new Error("missing bundle output");
        const suffixes = args
          .slice(args.indexOf("--output") + 2)
          .map((imageId) => {
            const entry = Object.entries(suffixByTarget).find(
              ([, suffix]) => image(suffix) === imageId,
            );
            if (entry === undefined) throw new Error("unexpected image ID");
            return entry[1];
          });
        await writeDockerSaveTar(output, suffixes);
        return { stderr: "", stdout: "" };
      }
      throw new Error(`Unexpected build command ${args.join(" ")}`);
    });

    await buildCandidateImageFamily("application", env, buildRun);
    await buildCandidateImageFamily("spacy", env, buildRun);
    await combineCandidateImageFamilies(directory, ownerToken);

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: identity,
        ownerToken,
        run: async (_command, args) => {
          if (args[1] === "load") return "Loaded image: ignored\n";
          const target =
            args.at(-1) === image("a")
              ? "standalone"
              : args.at(-1) === image("b")
                ? "runtime"
                : "spacy";
          const format = args[args.indexOf("--format") + 1];
          if (format === "{{.Id}}") return `${args.at(-1)}\n`;
          if (format?.includes("version")) {
            return `${identity.releaseIdentity}\n`;
          }
          if (format?.includes("description")) {
            return target === "standalone"
              ? "CAT standalone application with database preparation\n"
              : target === "runtime"
                ? "CAT start-only application runtime\n"
                : "CAT spaCy language analysis runtime\n";
          }
          return target === "standalone"
            ? "prepare-and-start\n"
            : target === "runtime"
              ? "start-only\n"
              : "provision-and-serve\n";
        },
      }),
    ).resolves.toMatchObject(identity);
  });

  it("strictly verifies and loads one candidate family without the sibling family", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    temporaryDirectories.push(directory);
    await writeCandidateImageFamily({
      directory,
      family: "application",
      identity: candidateIdentity,
      images: {
        images: [
          { imageId: image("a"), target: "standalone" },
          { imageId: image("b"), target: "runtime" },
        ],
      },
      ownerToken,
      run: async (args) => {
        const output = args[args.indexOf("--output") + 1];
        if (output === undefined) throw new Error("missing bundle output");
        await writeDockerSaveTar(output, ["a", "b"]);
        return "";
      },
    });
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return "Loaded image: ignored\n";
      const target = args.at(-1) === image("a") ? "standalone" : "runtime";
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "cat-validated-contract\n";
      if (format?.includes("description")) {
        return target === "standalone"
          ? "CAT standalone application with database preparation\n"
          : "CAT start-only application runtime\n";
      }
      return target === "standalone" ? "prepare-and-start\n" : "start-only\n";
    });

    await expect(
      verifyAndLoadImageFamilyArtifacts(directory, "application", {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).resolves.toMatchObject({ family: "application", schemaVersion: 2 });
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "load"),
    ).toHaveLength(1);
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "inspect"),
    ).toHaveLength(8);
  });

  it("exports the application and spaCy candidate families independently before combining them", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    temporaryDirectories.push(directory);
    const run = vi.fn(async (args: string[]) => {
      const output = args[args.indexOf("--output") + 1];
      if (output === undefined) throw new Error("missing bundle output");
      const suffixes = args
        .slice(args.indexOf("--output") + 2)
        .map((imageId) =>
          imageId === image("a") ? "a" : imageId === image("b") ? "b" : "c",
        );
      await writeDockerSaveTar(output, suffixes);
      return "";
    });
    const identity = {
      commitIdentity: revision,
      planIdentity: "complete-verification-contract",
      releaseIdentity: "cat-validated-contract",
      runIdentity: "run-123",
    };

    await writeCandidateImageFamily({
      directory,
      family: "application",
      identity,
      images: {
        images: [
          { imageId: image("a"), target: "standalone" },
          { imageId: image("b"), target: "runtime" },
        ],
      },
      ownerToken,
      run,
    });
    await writeCandidateImageFamily({
      directory,
      family: "spacy",
      identity,
      images: { images: [{ imageId: image("c"), target: "spacy" }] },
      ownerToken,
      run,
    });
    const manifest = await combineCandidateImageFamilies(directory, ownerToken);

    expect(manifest.candidates).toMatchObject({
      runtime: { bundle: { file: "application-images.tar" } },
      spacy: { bundle: { file: "spacy-image.tar" } },
      standalone: { bundle: { file: "application-images.tar" } },
    });
    expect(vi.mocked(run).mock.calls.map(([args]) => args.slice(-2))).toEqual([
      [image("a"), image("b")],
      ["--output", join(directory, "spacy-image.tar"), image("c")].slice(-2),
    ]);
  });

  it("removes a partial family bundle when export fails", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    temporaryDirectories.push(directory);
    const bundle = join(directory, "application-images.tar");

    await expect(
      writeCandidateImageFamily({
        directory,
        family: "application",
        identity: candidateIdentity,
        images: {
          images: [
            { imageId: image("a"), target: "standalone" },
            { imageId: image("b"), target: "runtime" },
          ],
        },
        ownerToken,
        run: async () => {
          await writeFile(bundle, "partial");
          throw new Error("save failed");
        },
      }),
    ).rejects.toThrow("save failed");
    await expect(access(bundle)).rejects.toThrow();
  });

  it("removes the entire owned root when full-manifest finalization fails", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    await mkdir(join(directory, "SHA256SUMS"));
    const run = async (args: string[]): Promise<string> => {
      const output = args[args.indexOf("--output") + 1];
      if (output === undefined) throw new Error("missing bundle output");
      await writeFile(output, "candidate bundle\n");
      return "";
    };

    await expect(
      writeCandidateImageBundles({
        ...candidateIdentity,
        directory,
        images: {
          images: [
            { imageId: image("a"), target: "standalone" },
            { imageId: image("b"), target: "runtime" },
            { imageId: image("c"), target: "spacy" },
          ],
        },
        ownerToken,
        run,
      }),
    ).rejects.toThrow();
    await expect(access(directory)).rejects.toThrow();
  });

  it("only cleans candidate directories owned beneath the operating-system temp root", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    await writeFile(join(directory, "marker"), "owned\n");

    await expect(
      cleanupCandidateImageArtifacts(directory, "wrong-owner-token"),
    ).rejects.toThrow("owner token does not match");
    await expect(access(directory)).resolves.toBeUndefined();
    await cleanupCandidateImageArtifacts(directory, ownerToken);
    await expect(access(directory)).rejects.toThrow();
    await expect(
      cleanupCandidateImageArtifacts(
        resolve(tmpdir(), "..", "workspaces"),
        ownerToken,
      ),
    ).rejects.toThrow("temporary directory");
  });

  it("rejects a symlinked existing ancestor before creating an escaped directory", async () => {
    const outsideParent = await mkdtemp("/var/tmp/cat-image-init-outside-");
    const link = join(tmpdir(), `cat-init-link-${process.pid}`);
    const escaped = join(outsideParent, "cat-candidate");
    await symlink(outsideParent, link);
    try {
      await expect(
        initializeCandidateImageArtifacts(
          join(link, "cat-candidate"),
          ownerToken,
        ),
      ).rejects.toThrow("unsafe ancestor");
      await expect(access(escaped)).rejects.toThrow();
    } finally {
      await rm(link, { force: true });
      await rm(outsideParent, { force: true, recursive: true });
    }
  });

  it("rejects cleanup through a parent symlink whose canonical root escapes the temp directory", async () => {
    const outsideParent = await mkdtemp("/var/tmp/cat-image-outside-");
    const outsideCandidate = join(outsideParent, "cat-candidate");
    const link = join(tmpdir(), `cat-parent-link-${process.pid}`);
    await mkdir(outsideCandidate);
    await symlink(outsideParent, link);
    try {
      await expect(
        cleanupCandidateImageArtifacts(join(link, "cat-candidate"), ownerToken),
      ).rejects.toThrow("unsafe ancestor");
      await expect(access(outsideCandidate)).resolves.toBeUndefined();
    } finally {
      await rm(link, { force: true });
      await rm(outsideParent, { force: true, recursive: true });
    }
  });

  it("rejects cleanup through a parent symlink within the temporary directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "cat-cleanup-parent-"));
    const candidate = join(parent, "cat-candidate");
    const link = join(tmpdir(), `cat-cleanup-link-${process.pid}`);
    await initializeCandidateImageArtifacts(candidate, ownerToken);
    await symlink(parent, link);
    try {
      await expect(
        cleanupCandidateImageArtifacts(
          join(link, candidate.slice(parent.length + 1)),
          ownerToken,
        ),
      ).rejects.toThrow("unsafe ancestor");
      await expect(access(candidate)).resolves.toBeUndefined();
    } finally {
      await rm(link, { force: true });
      await rm(parent, { force: true, recursive: true });
    }
  });

  it("writes checksums from real artifact bytes", async () => {
    const directory = await writeValidatedArtifact();
    const sums = await readFile(join(directory, "SHA256SUMS"), "utf8");

    expect(sums).toMatch(/^[a-f0-9]{64}  manifest\.json$/m);
    expect(sums).toMatch(/^[a-f0-9]{64}  application-images\.tar$/m);
    expect(sums).toMatch(/^[a-f0-9]{64}  spacy-image\.tar$/m);
  });

  it("rejects changed artifact bytes before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    await writeFile(join(directory, "application-images.tar"), "changed\n");
    const run = vi.fn(
      async (_command: string, _args: string[]): Promise<string> => "",
    );

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).rejects.toThrow("checksum does not match application-images.tar");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a candidate from another plan, release, run, or commit before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async () => "");

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: {
          ...candidateIdentity,
          runIdentity: "run-elsewhere",
        },
        ownerToken,
        run,
      }),
    ).rejects.toThrow("run identity");
    expect(run).not.toHaveBeenCalled();
  });

  it("loads the shared application bundle once and inspects every candidate before reporting success", async () => {
    const directory = await writeValidatedArtifact();
    const reports: string[] = [];
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return loadedImages(args);
      const target =
        args.at(-1) === image("a")
          ? "standalone"
          : args.at(-1) === image("b")
            ? "runtime"
            : "spacy";
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "cat-validated-contract\n";
      if (format?.includes("description")) {
        return target === "standalone"
          ? "CAT standalone application with database preparation\n"
          : target === "runtime"
            ? "CAT start-only application runtime\n"
            : "CAT spaCy language analysis runtime\n";
      }
      if (format === "{{ index .Config.Cmd 0 }}") {
        return target === "standalone"
          ? "prepare-and-start\n"
          : target === "runtime"
            ? "start-only\n"
            : "provision-and-serve\n";
      }
      throw new Error(`Unexpected Docker call ${args.join(" ")}`);
    });

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        report: (message) => reports.push(message),
        run,
      }),
    ).resolves.toMatchObject({ schemaVersion: 2 });

    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "load"),
    ).toHaveLength(2);
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "inspect"),
    ).toHaveLength(12);
    expect(reports.join("")).toContain("target=standalone");
    expect(reports.join("")).toContain("target=runtime");
    expect(reports.join("")).toContain("target=spacy");
  });

  it("rejects a loaded image capability mismatch", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return loadedImages(args);
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "unexpected\n";
      return "ignored\n";
    });

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).rejects.toThrow("Loaded standalone image does not match its manifest");
  });

  it("propagates Docker load failures", async () => {
    const directory = await writeValidatedArtifact();

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run: async () => {
          throw new Error("docker unavailable");
        },
      }),
    ).rejects.toThrow("docker unavailable");
  });

  it("does not infer loaded image provenance from Docker's human-readable output", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === "load") return `Loaded image ID: ${image("a")}\n`;
      const target =
        args.at(-1) === image("a")
          ? "standalone"
          : args.at(-1) === image("b")
            ? "runtime"
            : "spacy";
      const format = args[args.indexOf("--format") + 1];
      if (format === "{{.Id}}") return `${args.at(-1)}\n`;
      if (format?.includes("version")) return "cat-validated-contract\n";
      if (format?.includes("description")) {
        return target === "standalone"
          ? "CAT standalone application with database preparation\n"
          : target === "runtime"
            ? "CAT start-only application runtime\n"
            : "CAT spaCy language analysis runtime\n";
      }
      return target === "standalone"
        ? "prepare-and-start\n"
        : target === "runtime"
          ? "start-only\n"
          : "provision-and-serve\n";
    });

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).resolves.toMatchObject({ schemaVersion: 2 });
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args[1] === "inspect"),
    ).toBe(true);
  });

  it("rejects mixed standalone and runtime candidates before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as { candidates: { runtime: { releaseIdentity: string } } };
    manifest.candidates.runtime.releaseIdentity = "another-release";
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest) + "\n",
    );
    await writeCandidateImageChecksums(directory, ownerToken, () => undefined);
    const run = vi.fn(async () => "");

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).rejects.toThrow(
      "application candidates have inconsistent release identities",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a partial candidate whose release identity differs from its family identity", async () => {
    const { directory } = await createCandidateImageArtifactRoot(ownerToken);
    temporaryDirectories.push(directory);
    const run = async (args: string[]): Promise<string> => {
      const output = args[args.indexOf("--output") + 1];
      if (output === undefined) throw new Error("missing output");
      const suffixes = args
        .slice(args.indexOf("--output") + 2)
        .map((imageId) =>
          imageId === image("a") ? "a" : imageId === image("b") ? "b" : "c",
        );
      await writeDockerSaveTar(output, suffixes);
      return "";
    };
    await writeCandidateImageFamily({
      directory,
      family: "application",
      identity: candidateIdentity,
      images: {
        images: [
          { imageId: image("a"), target: "standalone" },
          { imageId: image("b"), target: "runtime" },
        ],
      },
      ownerToken,
      run,
    });
    await writeCandidateImageFamily({
      directory,
      family: "spacy",
      identity: candidateIdentity,
      images: { images: [{ imageId: image("c"), target: "spacy" }] },
      ownerToken,
      run,
    });
    const partialPath = join(directory, "spacy-manifest.json");
    const partial = JSON.parse(await readFile(partialPath, "utf8")) as {
      candidates: { spacy: { releaseIdentity: string } };
    };
    partial.candidates.spacy.releaseIdentity = "another-release";
    await writeFile(partialPath, JSON.stringify(partial) + "\n");

    await expect(
      combineCandidateImageFamilies(directory, ownerToken),
    ).rejects.toThrow("candidate release identity");
  });

  it("rejects a malformed candidate bundle filename before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    ) as { candidates: { standalone: { bundle: { file: string } } } };
    manifest.candidates.standalone.bundle.file = "../outside.tar";
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest) + "\n",
    );
    await writeCandidateImageChecksums(directory, ownerToken, () => undefined);
    const run = vi.fn(async () => "");

    await expect(
      verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        run,
      }),
    ).rejects.toThrow("invalid standalone entry");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a bundle symlink that escapes the artifact directory before Docker is invoked", async () => {
    const directory = await writeValidatedArtifact();
    const outside = join(tmpdir(), `cat-candidate-outside-${process.pid}.tar`);
    await writeFile(outside, "application images\n");
    await rm(join(directory, "application-images.tar"));
    await symlink(outside, join(directory, "application-images.tar"));
    const run = vi.fn(async () => "");
    try {
      await expect(
        verifyAndLoadImageArtifacts(directory, {
          expectedIdentity: candidateIdentity,
          ownerToken,
          run,
        }),
      ).rejects.toThrow("regular file");
      expect(run).not.toHaveBeenCalled();
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("publishes every immutable target with the app semver, not the candidate release identity", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(
      async (_command: string, _args: string[]): Promise<string> => "",
    );

    await publishImageArtifacts(directory, {
      expectedIdentity: candidateIdentity,
      ownerToken,
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
      "ghcr.io/acme/cat-spacy-server:1.2.3",
      "ghcr.io/acme/cat-spacy-server:sha-0123456789ab",
      "ghcr.io/acme/cat-spacy-server:latest",
    ]);
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args[0] === "buildx"),
    ).toBe(false);
  });

  it("revalidates bundle checksums at publish time before tagging", async () => {
    const directory = await writeValidatedArtifact();
    await writeFile(join(directory, "spacy-image.tar"), "swapped\n");
    const run = vi.fn(async () => "");

    await expect(
      publishImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        env: { GITHUB_SHA: revision, IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "1.2.3" }),
        run,
      }),
    ).rejects.toThrow("checksum does not match spacy-image.tar");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects publication when GITHUB_SHA differs from the expected commit", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async () => "");

    await expect(
      publishImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        env: { GITHUB_SHA: "f".repeat(40), IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "1.2.3" }),
        run,
      }),
    ).rejects.toThrow("GITHUB_SHA does not match");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects an invalid application version before tagging", async () => {
    const directory = await writeValidatedArtifact();
    const run = vi.fn(async () => "");

    await expect(
      publishImageArtifacts(directory, {
        expectedIdentity: candidateIdentity,
        ownerToken,
        env: { GITHUB_SHA: revision, IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "not-a-semver" }),
        run,
      }),
    ).rejects.toThrow("Invalid release version");
    expect(run).not.toHaveBeenCalled();
  });

  it("requires both application candidates to carry the same release identity", async () => {
    const directory = await writeManifest(
      "cat-validated-one",
      "cat-validated-two",
    );

    await expect(
      publishImageArtifacts(directory, {
        expectedIdentity: {
          ...candidateIdentity,
          releaseIdentity: "cat-validated-one",
        },
        ownerToken,
        env: { GITHUB_SHA: revision, IMAGE: "ghcr.io/acme/cat" },
        readApplicationManifest: async () => ({ version: "1.2.3" }),
        run: async () => "",
      }),
    ).rejects.toThrow("inconsistent release identities");
  });
});
