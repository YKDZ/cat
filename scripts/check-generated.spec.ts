import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { generateRoutes } from "../apps/cli/scripts/generate-routes.ts";
import { compareGeneratedFile } from "./check-generated.ts";

describe("generated file drift", () => {
  it("reports stale CLI routes generated from the application API", async () => {
    const directory = await mkdtemp(`${tmpdir()}/cat-routes-drift-`);
    try {
      const actual = resolve(directory, "actual.ts");
      const stale = resolve(directory, "stale.ts");
      generateRoutes({ outputFile: actual });
      await writeFile(stale, "// stale routes\n", "utf8");

      await expect(
        compareGeneratedFile(stale, actual, "CLI routes"),
      ).resolves.toEqual(["CLI routes"]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
