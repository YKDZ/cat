import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageDirectories = [
  "packages/plugin-core",
  "@cat-plugin/basic-qa-checker",
  "@cat-plugin/basic-tokenizer",
  "@cat-plugin/json-file-handler",
  "@cat-plugin/libretranslate-advisor",
  "@cat-plugin/local-storage-provider",
  "@cat-plugin/markdown-file-handler",
  "@cat-plugin/openai-llm-provider",
  "@cat-plugin/openai-vectorizer",
  "@cat-plugin/password-auth-provider",
  "@cat-plugin/pgvector-storage",
  "@cat-plugin/s3-storage-provider",
  "@cat-plugin/spacy-segmenter",
  "@cat-plugin/tei-rerank-provider",
  "@cat-plugin/tiny-widget",
  "@cat-plugin/totp-mfa-provider",
  "@cat-plugin/yaml-file-handler",
] as const;
const pluginNames = packageDirectories
  .filter((directory) => directory.startsWith("@cat-plugin/"))
  .map((directory) => directory.replace("@cat-plugin/", "@cat-plugin/"));

type Artifact = {
  directory: (typeof packageDirectories)[number];
  filename: string;
  manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    exports?: Record<string, unknown>;
    imports?: Record<string, unknown>;
    name: string;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    types?: string;
    version: string;
  };
};

let temporaryDirectory: string;
let artifactDirectory: string;
let artifacts: Artifact[] = [];
const sourceManifests = new Map<string, string>();
const compilerInputs = new Map<string, string[]>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseJsonRecord = (
  value: string,
  label: string,
): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
};

const parseArtifactManifest = (
  value: string,
  label: string,
): Artifact["manifest"] => {
  const manifest = parseJsonRecord(value, label);
  if (
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  ) {
    throw new Error(`${label} must define string name and version fields`);
  }
  // The test reads the optional fields defensively and only asserts their public shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return manifest as Artifact["manifest"];
};

const run = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) => {
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    const details = [error instanceof Error ? error.message : String(error)];
    if (isRecord(error)) {
      if (typeof error.stdout === "string") details.push(error.stdout);
      if (typeof error.stderr === "string") details.push(error.stderr);
    }
    throw new Error(details.filter(Boolean).join("\n"), { cause: error });
  }
};

const packPackage = async (
  directory: (typeof packageDirectories)[number],
  destination: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Artifact> => {
  const { stdout } = await run(
    "pnpm",
    ["run", "pack:artifact", "--", destination],
    { cwd: resolve(root, directory), env },
  );
  const output = stdout.trim().split("\n").at(-1);
  if (output === undefined) throw new Error(`No pack output for ${directory}`);
  const result = parseJsonRecord(output, `pack output for ${directory}`);
  if (typeof result.filename !== "string") {
    throw new Error(`Pack output for ${directory} did not include a filename`);
  }
  const extractDirectory = join(
    temporaryDirectory,
    "extract",
    directory.replaceAll("/", "-"),
  );
  await mkdir(extractDirectory, { recursive: true });
  await run("tar", ["-xzf", result.filename, "-C", extractDirectory]);
  const manifest = parseArtifactManifest(
    await readFile(join(extractDirectory, "package/package.json"), "utf8"),
    `${directory} package.json`,
  );
  return { directory, filename: result.filename, manifest };
};

const readSourceManifests = async (): Promise<Map<string, string>> =>
  new Map(
    await Promise.all(
      packageDirectories.map(
        async (directory) =>
          [
            directory,
            await readFile(resolve(root, directory, "package.json"), "utf8"),
          ] as const,
      ),
    ),
  );

const expectSourceManifestsUnchanged = async (): Promise<void> => {
  const after = await readSourceManifests();
  expect(after).toEqual(sourceManifests);
};

const listFilesRecursively = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
};

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "cat-public-packages-"));
  artifactDirectory = join(temporaryDirectory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const initialManifests = await readSourceManifests();
  for (const [directory, contents] of initialManifests) {
    sourceManifests.set(directory, contents);
  }

  await run("pnpm", ["build-plugins"]);
  for (const directory of packageDirectories) {
    const packageRoot = resolve(root, directory);
    const config = ["tsconfig.build.json", "tsconfig.lib.json"]
      .map((name) => resolve(packageRoot, name))
      .find((path) => existsSync(path));
    if (config === undefined) {
      throw new Error(`Missing compiled declaration config for ${directory}`);
    }
    const { stdout } = await run(
      resolve(root, "node_modules/.bin/tsc"),
      ["--listFilesOnly", "--project", config],
      { cwd: packageRoot },
    );
    compilerInputs.set(
      directory,
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  artifacts = await Promise.all(
    packageDirectories.map(async (directory) =>
      packPackage(directory, artifactDirectory),
    ),
  );
}, 300_000);

afterAll(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe("public package artifact matrix", () => {
  it("compiles public declarations without test sources", () => {
    expect(compilerInputs.size).toBe(17);
    for (const [directory, files] of compilerInputs) {
      const workspaceFiles = files.filter(
        (file) => file.startsWith(root) && !file.includes("/node_modules/"),
      );
      expect(workspaceFiles.length, directory).toBeGreaterThan(0);
      expect(workspaceFiles, directory).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/\.(?:spec|test)\.[cm]?[jt]sx?$/),
        ]),
      );
    }
  });

  it("keeps test modules out of the built application", async () => {
    const appDist = resolve(root, "apps/app/dist");
    expect(existsSync(appDist)).toBe(true);
    const files = await listFilesRecursively(appDist);
    expect(files.length).toBeGreaterThan(0);
    expect(files).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.(?:spec|test)\.[cm]?[jt]sx?$/),
      ]),
    );

    const inspectable = files.filter((file) => /\.(?:js|mjs|map)$/.test(file));
    for (const file of inspectable) {
      const contents = await readFile(file, "utf8");
      if (file.endsWith(".map")) {
        const sourceMap = parseJsonRecord(contents, file);
        expect(sourceMap.sources, file).not.toEqual(
          expect.arrayContaining([
            expect.stringMatching(/\.(?:spec|test)\.[cm]?[jt]sx?$/),
          ]),
        );
      } else {
        expect(contents, file).not.toMatch(
          /\/\/#region [^\n]*\.(?:spec|test)\.[cm]?[jt]sx?/,
        );
      }
    }
  });

  it("packs all 17 packages with intentional compiled contents and clean metadata", async () => {
    expect(artifacts).toHaveLength(17);

    await Promise.all(
      artifacts.map(async (artifact) => {
        const { stdout } = await run("tar", ["-tzf", artifact.filename]);
        const files = stdout.trim().split("\n");
        const manifestText = JSON.stringify(artifact.manifest);

        expect(files, artifact.manifest.name).toContain(
          "package/dist/index.js",
        );
        expect(files, artifact.manifest.name).toContain(
          "package/dist/index.d.ts",
        );
        expect(files, artifact.manifest.name).toContain("package/package.json");
        expect(files, artifact.manifest.name).not.toEqual(
          expect.arrayContaining([
            expect.stringMatching(/(?:^|\/)src\//),
            expect.stringMatching(/\.(?:spec|test)\.[cm]?[jt]sx?$/),
            expect.stringMatching(/tsbuildinfo$/),
          ]),
        );
        expect(manifestText, artifact.manifest.name).not.toMatch(
          /(?:workspace|link):/,
        );
        expect(artifact.manifest.devDependencies).toBeUndefined();
        expect(artifact.manifest.scripts).toBeUndefined();
        expect(
          artifact.manifest.imports,
          artifact.manifest.name,
        ).toBeUndefined();
        expect(artifact.manifest.types).toBe("./dist/index.d.ts");

        const declaration = await readFile(
          join(
            temporaryDirectory,
            "extract",
            artifact.directory.replaceAll("/", "-"),
            "package/dist/index.d.ts",
          ),
          "utf8",
        );
        expect(declaration, artifact.manifest.name).not.toMatch(
          /@cat\/(?:domain|shared)|#\//,
        );
      }),
    );

    await expectSourceManifestsUnchanged();
  });

  it("typechecks and imports every tarball in an isolated consumer", async () => {
    const consumer = join(temporaryDirectory, "consumer");
    await mkdir(consumer, { recursive: true });
    const dependencies = Object.fromEntries(
      artifacts.map((artifact) => [
        artifact.manifest.name,
        `file:${artifact.filename}`,
      ]),
    );
    await writeFile(
      join(consumer, "package.json"),
      `${JSON.stringify(
        {
          name: "cat-public-package-consumer",
          private: true,
          type: "module",
          dependencies,
          devDependencies: { "@types/node": "^24.13.3" },
        },
        null,
        2,
      )}\n`,
    );
    await run(
      "pnpm",
      [
        "install",
        "--prefer-offline",
        "--ignore-scripts",
        "--no-frozen-lockfile",
      ],
      { cwd: consumer },
    );

    const pluginImports = pluginNames
      .map((name, index) => `import plugin${index} from "${name}";`)
      .join("\n");
    await writeFile(
      join(consumer, "consumer.ts"),
      `import type { CatPlugin, ComponentData, Token } from "@cat/plugin-core";
import { AuthFactor, FileImporter, QAChecker } from "@cat/plugin-core";
import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";
${pluginImports}

const plugins: CatPlugin[] = [${pluginNames.map((_, index) => `plugin${index}`).join(", ")}];
const component: ComponentData = { name: "example", slot: "example", url: "example.js" };
const token: Token = { type: "text", value: "x", start: 0, end: 1 };
void [plugins, component, token, AuthFactor, FileImporter, QAChecker, createSandbox, safeCustomElements];
`,
    );
    await writeFile(
      join(consumer, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2023", "DOM"],
            module: "ESNext",
            moduleResolution: "bundler",
            noEmit: true,
            strict: true,
            target: "es2023",
            types: ["node"],
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      )}\n`,
    );
    await run(resolve(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
      cwd: consumer,
    });

    await writeFile(
      join(consumer, "runtime.mjs"),
      `const core = await import("@cat/plugin-core");
const names = ${JSON.stringify(pluginNames)};
const plugins = new Map();
for (const name of names) plugins.set(name, await import(name));
const qa = plugins.get("@cat-plugin/basic-qa-checker").default.services({})[0];
const file = plugins.get("@cat-plugin/json-file-handler").default.services({})[0];
const auth = plugins.get("@cat-plugin/totp-mfa-provider").default.services({ capabilities: {} })[0];
if (!(qa instanceof core.QAChecker)) throw new Error("duplicate QA plugin-core instance");
if (!(file instanceof core.FileImporter)) throw new Error("duplicate file plugin-core instance");
if (!(auth instanceof core.AuthFactor)) throw new Error("duplicate auth plugin-core instance");
if (plugins.get("@cat-plugin/tiny-widget").default.components({}).length !== 1) {
  throw new Error("browser plugin runtime failed");
}
console.log("isolated runtime ok");
`,
    );
    const { stdout } = await run(process.execPath, ["runtime.mjs"], {
      cwd: consumer,
      env: { ...process.env, NODE_ENV: "production" },
    });
    expect(stdout).toContain("isolated runtime ok");

    await Promise.all(
      ["test", "development", "production"].map(async (nodeEnv) =>
        run(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            'await import("@cat-plugin/password-auth-provider")',
          ],
          {
            cwd: consumer,
            env: { ...process.env, NODE_ENV: nodeEnv },
          },
        ),
      ),
    );
  }, 180_000);

  it("leaves source manifests byte-identical after failure and concurrent packs", async () => {
    const failureDestination = join(temporaryDirectory, "induced-failure");
    await mkdir(failureDestination, { recursive: true });
    await expect(
      packPackage("packages/plugin-core", failureDestination, {
        ...process.env,
        CAT_PACK_INDUCE_FAILURE: "1",
      }),
    ).rejects.toThrow();
    await expectSourceManifestsUnchanged();

    const concurrentA = join(temporaryDirectory, "concurrent-a");
    const concurrentB = join(temporaryDirectory, "concurrent-b");
    await Promise.all([
      mkdir(concurrentA, { recursive: true }),
      mkdir(concurrentB, { recursive: true }),
    ]);
    const [first, second] = await Promise.all([
      packPackage("@cat-plugin/tiny-widget", concurrentA),
      packPackage("@cat-plugin/tiny-widget", concurrentB),
    ]);

    expect(basename(first.filename)).toBe(basename(second.filename));
    await expectSourceManifestsUnchanged();
  }, 60_000);
});
