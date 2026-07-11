import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { generateRoutes } from "../apps/cli/scripts/generate-routes.ts";

const root = resolve(import.meta.dirname, "..");
const generatedDirectory = resolve(root, "packages/shared/src/schema/drizzle");
const generatedRoutesFile = resolve(root, "apps/cli/src/routes.generated.ts");

const runCodegen = async (outputDirectory: string): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(root, "packages/db/src/zod/codegen.ts")],
      {
        cwd: root,
        env: { ...process.env, CODEGEN_OUTPUT_DIR: outputDirectory },
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`schema codegen exited with status ${code ?? 1}`)),
    );
  });
};

export const compareGeneratedFile = async (
  expectedFile: string,
  actualFile: string,
  label: string,
): Promise<string[]> => {
  const [expectedContents, actualContents] = await Promise.all([
    readFile(expectedFile, "utf8").catch(() => ""),
    readFile(actualFile, "utf8").catch(() => ""),
  ]);
  return expectedContents === actualContents ? [] : [label];
};

export const checkGeneratedFiles = async (): Promise<void> => {
  const temporaryDirectory = await mkdtemp(`${tmpdir()}/cat-codegen-check-`);
  try {
    const temporarySchemaDirectory = resolve(temporaryDirectory, "schemas");
    const temporaryRoutesFile = resolve(
      temporaryDirectory,
      "routes.generated.ts",
    );
    await runCodegen(temporarySchemaDirectory);
    generateRoutes({ outputFile: temporaryRoutesFile });
    const expected = new Set(await readdir(generatedDirectory));
    const actual = new Set(await readdir(temporarySchemaDirectory));
    const files = new Set([...expected, ...actual]);
    const mismatches: string[] = [];
    for (const file of files) {
      mismatches.push(
        ...(await compareGeneratedFile(
          resolve(generatedDirectory, file),
          resolve(temporarySchemaDirectory, file),
          `shared schema ${file}`,
        )),
      );
    }
    mismatches.push(
      ...(await compareGeneratedFile(
        generatedRoutesFile,
        temporaryRoutesFile,
        "CLI routes",
      )),
    );
    if (mismatches.length > 0) {
      throw new Error(`Generated files are stale: ${mismatches.join(", ")}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) ===
    resolve(dirname(import.meta.filename), "check-generated.ts");

if (isDirectExecution) await checkGeneratedFiles();
