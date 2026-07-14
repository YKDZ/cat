import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

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
});
