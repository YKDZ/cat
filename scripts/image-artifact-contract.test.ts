import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { verifyAndLoadImageArtifacts } from "./image-artifacts.ts";
import {
  createCandidateImageArtifactRoot,
  writeCandidateImageChecksums,
  writeCandidateImageBundles,
} from "./image-candidates.ts";

const execFileAsync = promisify(execFile);
const immutableImageId = /^sha256:[a-f0-9]{64}$/;

const docker = async (args: string[]): Promise<{ stdout: string }> =>
  await execFileAsync("docker", args, { encoding: "utf8" });

describe("validated image artifact", () => {
  it("preserves the original config ID through save and load", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-image-artifact-"));
    const tag = `cat-image-artifact-${process.pid}-${Date.now()}:contract`;
    const iidfile = join(directory, "image.iid");
    const archive = join(directory, "image.tar");
    let imageId: string | undefined;
    try {
      await writeFile(
        join(directory, "Dockerfile"),
        'FROM busybox:1.36.1\nLABEL org.opencontainers.image.version="artifact-contract"\nCMD ["contract"]\n',
      );
      await docker(["build", "--iidfile", iidfile, "--tag", tag, directory]);
      imageId = (await readFile(iidfile, "utf8")).trim();
      expect(imageId).toMatch(immutableImageId);
      await docker(["image", "save", "--output", archive, imageId]);
      await docker(["image", "rm", "--force", tag]);
      await docker(["image", "load", "--input", archive]);
      const inspected = await docker([
        "image",
        "inspect",
        "--format",
        "{{.Id}}",
        imageId,
      ]);
      expect(inspected.stdout.trim()).toBe(imageId);
    } finally {
      if (imageId !== undefined) {
        await docker(["image", "rm", "--force", imageId]).catch(
          () => undefined,
        );
      }
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("round-trips two application images in one bundle and spaCy in its own bundle", async () => {
    const { directory } = await createCandidateImageArtifactRoot(
      "docker-roundtrip-owner-token",
    );
    const identities = {
      commitIdentity: "0123456789abcdef0123456789abcdef01234567",
      planIdentity: "artifact-contract-plan",
      releaseIdentity: "artifact-contract-release",
      runIdentity: "artifact-contract-run",
    };
    const ownerToken = "docker-roundtrip-owner-token";
    const imageIds: string[] = [];
    try {
      await writeFile(
        join(directory, "Dockerfile"),
        `FROM busybox:1.36.1 AS common
FROM common AS standalone
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT standalone application with database preparation"
CMD ["prepare-and-start"]
FROM common AS runtime
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT start-only application runtime"
CMD ["start-only"]
FROM common AS spacy
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT spaCy language analysis runtime"
CMD ["provision-and-serve"]
`,
      );
      for (const target of ["standalone", "runtime", "spacy"] as const) {
        const iidfile = join(directory, `${target}.iid`);
        await docker([
          "build",
          "--quiet",
          "--target",
          target,
          "--iidfile",
          iidfile,
          directory,
        ]);
        imageIds.push((await readFile(iidfile, "utf8")).trim());
      }
      await writeCandidateImageBundles({
        ...identities,
        directory,
        images: {
          images: [
            { imageId: imageIds[0] as string, target: "standalone" },
            { imageId: imageIds[1] as string, target: "runtime" },
            { imageId: imageIds[2] as string, target: "spacy" },
          ],
        },
        ownerToken,
        run: async (args) => (await docker(args)).stdout,
      });
      await docker(["image", "rm", "--force", ...imageIds]);

      const manifest = await verifyAndLoadImageArtifacts(directory, {
        expectedIdentity: identities,
        ownerToken,
        run: async (command, args) => {
          expect(command).toBe("docker");
          return (await docker(args)).stdout;
        },
      });

      expect(manifest.candidates.standalone.bundle).toEqual(
        manifest.candidates.runtime.bundle,
      );
      expect(manifest.candidates.spacy.bundle.file).toBe("spacy-image.tar");
      for (const imageId of imageIds) {
        expect(
          (await docker(["image", "inspect", "--format", "{{.Id}}", imageId]))
            .stdout,
        ).toContain(imageId);
      }
    } finally {
      if (imageIds.length > 0) {
        await docker(["image", "rm", "--force", ...imageIds]).catch(
          () => undefined,
        );
      }
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects tag text that impersonates preexisting candidate image IDs", async () => {
    const { directory } = await createCandidateImageArtifactRoot(
      "docker-provenance-owner-token",
    );
    const identities = {
      commitIdentity: "0123456789abcdef0123456789abcdef01234567",
      planIdentity: "artifact-contract-plan",
      releaseIdentity: "artifact-contract-release",
      runIdentity: "artifact-contract-run",
    };
    const ownerToken = "docker-provenance-owner-token";
    const carrierTag = `cat-audit-carrier-${process.pid}-${Date.now()}:contract`;
    const imageIds: string[] = [];
    const spoofTags: string[] = [];
    try {
      await writeFile(
        join(directory, "Dockerfile"),
        `FROM busybox:1.36.1 AS standalone
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT standalone application with database preparation"
CMD ["prepare-and-start"]
FROM busybox:1.36.1 AS runtime
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT start-only application runtime"
CMD ["start-only"]
FROM busybox:1.36.1 AS spacy
LABEL org.opencontainers.image.version="${identities.releaseIdentity}" org.opencontainers.image.description="CAT spaCy language analysis runtime"
CMD ["provision-and-serve"]
`,
      );
      for (const target of ["standalone", "runtime", "spacy"] as const) {
        const iidfile = join(directory, `${target}.iid`);
        await docker([
          "build",
          "--quiet",
          "--target",
          target,
          "--iidfile",
          iidfile,
          directory,
        ]);
        imageIds.push((await readFile(iidfile, "utf8")).trim());
      }
      await writeCandidateImageBundles({
        ...identities,
        directory,
        images: {
          images: [
            { imageId: imageIds[0] as string, target: "standalone" },
            { imageId: imageIds[1] as string, target: "runtime" },
            { imageId: imageIds[2] as string, target: "spacy" },
          ],
        },
        ownerToken,
        run: async (args) => (await docker(args)).stdout,
      });

      await writeFile(join(directory, "carrier"), "spoof bundle carrier\n");
      await writeFile(
        join(directory, "Dockerfile.carrier"),
        'FROM scratch\nCOPY carrier /carrier\nCMD ["carrier"]\n',
      );
      await docker([
        "build",
        "--file",
        join(directory, "Dockerfile.carrier"),
        "--tag",
        carrierTag,
        directory,
      ]);
      for (const imageId of imageIds) {
        const spoofTag = `cat-audit/sha256:${imageId.slice("sha256:".length)}`;
        spoofTags.push(spoofTag);
        await docker(["image", "tag", carrierTag, spoofTag]);
      }
      await docker([
        "image",
        "save",
        "--output",
        join(directory, "application-images.tar"),
        spoofTags[0] as string,
        spoofTags[1] as string,
      ]);
      await docker([
        "image",
        "save",
        "--output",
        join(directory, "spacy-image.tar"),
        spoofTags[2] as string,
      ]);
      const manifestPath = join(directory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        candidates: {
          runtime: { bundle: { sha256: string } };
          spacy: { bundle: { sha256: string } };
          standalone: { bundle: { sha256: string } };
        };
      };
      const digest = async (file: string): Promise<string> =>
        createHash("sha256")
          .update(await readFile(join(directory, file)))
          .digest("hex");
      const applicationDigest = await digest("application-images.tar");
      manifest.candidates.standalone.bundle.sha256 = applicationDigest;
      manifest.candidates.runtime.bundle.sha256 = applicationDigest;
      manifest.candidates.spacy.bundle.sha256 = await digest("spacy-image.tar");
      await writeFile(manifestPath, JSON.stringify(manifest) + "\n");
      await writeCandidateImageChecksums(
        directory,
        ownerToken,
        () => undefined,
      );

      await expect(
        verifyAndLoadImageArtifacts(directory, {
          expectedIdentity: identities,
          ownerToken,
          run: async (command, args) => {
            expect(command).toBe("docker");
            return (await docker(args)).stdout;
          },
        }),
      ).rejects.toThrow("invalid image set");
    } finally {
      await docker(["image", "rm", "--force", carrierTag]).catch(
        () => undefined,
      );
      if (spoofTags.length > 0) {
        await docker(["image", "rm", "--force", ...spoofTags]).catch(
          () => undefined,
        );
      }
      if (imageIds.length > 0) {
        await docker(["image", "rm", "--force", ...imageIds]).catch(
          () => undefined,
        );
      }
      await rm(directory, { force: true, recursive: true });
    }
  });
});
