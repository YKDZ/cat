import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateRoutes } from "./generate-routes.ts";

let fixtureDirectory: string;

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "cat-cli-routes-"));
});

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("CLI route generation", () => {
  it("follows the app-api package export after its source layout moves", async () => {
    const routerDirectory = join(fixtureDirectory, "relocated-api", "internal");
    const routerFile = join(routerDirectory, "router.ts");
    const procedureFile = join(routerDirectory, "procedures.ts");
    const outputFile = join(fixtureDirectory, "routes.generated.ts");
    await mkdir(routerDirectory, { recursive: true });
    await writeFile(
      routerFile,
      'import * as project from "./procedures.ts";\n',
      "utf8",
    );
    await writeFile(
      procedureFile,
      "export const list = createProcedure();\n",
      "utf8",
    );

    const resolvePackageExport = vi.fn((specifier: string) => {
      expect(specifier).toBe("@cat/app-api/orpc/router");
      return pathToFileURL(routerFile).href;
    });

    const result = generateRoutes({ outputFile, resolvePackageExport });

    expect(resolvePackageExport).toHaveBeenCalledOnce();
    expect(result).toEqual({ direct: 1, nested: 0, total: 1 });
    await expect(readFile(outputFile, "utf8")).resolves.toContain(
      '"project.list"',
    );
  });
});
