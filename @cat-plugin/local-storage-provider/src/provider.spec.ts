import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Provider } from "./provider.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("local storage readiness", () => {
  it("proves the configured root is writable without retaining a probe file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-storage-readiness-"));
    directories.push(directory);
    const provider = new Provider({ "root-path": directory });

    await expect(provider.ping()).resolves.toBeUndefined();
    await expect(readdir(directory)).resolves.toEqual([]);
  });
});
