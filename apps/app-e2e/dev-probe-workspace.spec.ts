import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDevProbeWorkspace,
  removeDevProbeWorkspace,
  writeDevHmrProbe,
} from "./dev-probe-workspace.ts";

describe("development probe workspace", () => {
  it("keeps cell-scoped optimizer and HMR sources under the operating-system temporary directory", async () => {
    const workspace = await createDevProbeWorkspace("vitest-probe-cell");
    try {
      expect(workspace.directory).toBe(
        resolve(tmpdir(), "cat-e2e-probes/vitest-probe-cell"),
      );
      await writeDevHmrProbe(workspace, "application", "application-updated");
      await writeDevHmrProbe(workspace, "private-jit", "private-updated");
      await expect(
        access(workspace.applicationSourcePath),
      ).resolves.toBeUndefined();
      await expect(
        access(workspace.privateJitSourcePath),
      ).resolves.toBeUndefined();
      await expect(
        readFile(`${workspace.privateJitPackageRoot}/package.json`, "utf8"),
      ).resolves.toContain('"source":"./src/probe.vue"');
    } finally {
      await removeDevProbeWorkspace(workspace);
    }
    await expect(access(workspace.directory)).rejects.toThrow();
  });

  it("cleans failed probe content before the next cell creates its own sources", async () => {
    const failed = await createDevProbeWorkspace("vitest-failed-cell");
    try {
      await writeDevHmrProbe(failed, "application", "failed-update");
      throw new Error("simulated probe failure");
    } catch (error) {
      expect(error).toMatchObject({ message: "simulated probe failure" });
    } finally {
      await removeDevProbeWorkspace(failed);
    }

    const next = await createDevProbeWorkspace("vitest-next-cell");
    try {
      await expect(
        readFile(next.applicationSourcePath, "utf8"),
      ).resolves.toContain("application-initial");
    } finally {
      await removeDevProbeWorkspace(next);
    }
  });
});
