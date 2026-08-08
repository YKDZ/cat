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
const pluginDirectoryRoot = join(root, "@cat-plugin");
const pluginDirectories = (
  await readdir(pluginDirectoryRoot, { withFileTypes: true })
)
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(pluginDirectoryRoot, entry.name, "package.json")),
  )
  .map((entry) => `@cat-plugin/${entry.name}`)
  .sort();
const packageDirectories = ["packages/plugin-core", ...pluginDirectories];

type Artifact = {
  directory: string;
  filename: string;
  manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    exports?: Record<string, unknown>;
    imports?: Record<string, unknown>;
    keywords?: string[];
    main?: string;
    name: string;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    types?: string;
    typings?: string;
    typesVersions?: Record<string, unknown>;
    version: string;
  };
  pluginManifest?: {
    entry: string;
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
  // The test reads optional fields defensively before asserting their artifact contract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return manifest as Artifact["manifest"];
};

const parsePluginManifest = (
  value: string,
  label: string,
): NonNullable<Artifact["pluginManifest"]> => {
  const manifest = parseJsonRecord(value, label);
  if (typeof manifest.entry !== "string") {
    throw new Error(`${label} must define a string Plugin Manifest entry`);
  }
  return { entry: manifest.entry };
};

const workspacePluginNames = (
  await Promise.all(
    pluginDirectories.map(
      async (directory) =>
        parseArtifactManifest(
          await readFile(resolve(root, directory, "package.json"), "utf8"),
          `${directory} package.json`,
        ).name,
    ),
  )
).sort();

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
  directory: string,
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
  const pluginManifest = directory.startsWith("@cat-plugin/")
    ? parsePluginManifest(
        await readFile(join(extractDirectory, "package/manifest.json"), "utf8"),
        `${directory} Plugin Manifest`,
      )
    : undefined;
  return {
    directory,
    filename: result.filename,
    manifest,
    ...(pluginManifest === undefined ? {} : { pluginManifest }),
  };
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
  temporaryDirectory = await mkdtemp(join(tmpdir(), "cat-package-artifacts-"));
  artifactDirectory = join(temporaryDirectory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });
  const initialManifests = await readSourceManifests();
  for (const [directory, contents] of initialManifests) {
    sourceManifests.set(directory, contents);
  }

  await run("pnpm", ["build-plugins"]);
  for (const directory of ["packages/plugin-core"] as const) {
    const packageRoot = resolve(root, directory);
    const config = ["tsconfig.build.json", "tsconfig.lib.json"]
      .map((name) => resolve(packageRoot, name))
      .find((path) => existsSync(path));
    if (config === undefined) throw new Error(`Missing SDK declaration config`);
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

describe("package artifact matrix", () => {
  it("uses package artifact terminology in staging failures", async () => {
    const stagingSource = await readFile(
      resolve(root, "scripts/pack-package-artifact.ts"),
      "utf8",
    );

    expect(stagingSource).not.toMatch(
      new RegExp("public\\s+(?:runtime|shape)", "i"),
    );
    expect(stagingSource).toContain("Publishable package artifact dependency");
  });

  it("compiles SDK declarations without test sources", () => {
    expect(compilerInputs.size).toBe(1);
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

  it("packs the SDK and runtime-only plugins with intentional contents and clean metadata", async () => {
    expect(
      artifacts
        .filter((artifact) => artifact.directory.startsWith("@cat-plugin/"))
        .map((artifact) => artifact.directory)
        .sort(),
    ).toEqual(pluginDirectories);
    expect(
      artifacts
        .filter((artifact) => artifact.directory.startsWith("@cat-plugin/"))
        .map((artifact) => artifact.manifest.name)
        .sort(),
    ).toEqual(workspacePluginNames);

    await Promise.all(
      artifacts.map(async (artifact) => {
        const { stdout } = await run("tar", ["-tzf", artifact.filename]);
        const files = stdout.trim().split("\n");
        const manifestText = JSON.stringify(artifact.manifest);

        expect(files, artifact.manifest.name).toContain(
          "package/dist/index.js",
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
        if (artifact.directory === "packages/plugin-core") {
          expect(files, artifact.manifest.name).toContain(
            "package/dist/index.d.ts",
          );
          expect(files, artifact.manifest.name).toContain(
            "package/dist/client.js",
          );
          expect(files, artifact.manifest.name).toContain(
            "package/dist/client.d.ts",
          );
          expect(artifact.manifest.types).toBe("./dist/index.d.ts");
          expect(artifact.manifest.exports).toEqual({
            ".": {
              types: "./dist/index.d.ts",
              import: "./dist/index.js",
            },
            "./client": {
              types: "./dist/client.d.ts",
              import: "./dist/client.js",
            },
          });
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
          expect(declaration).toContain("logger: PluginLogger;");
        } else {
          expect(files, artifact.manifest.name).toContain(
            "package/manifest.json",
          );
          expect(artifact.pluginManifest).toBeDefined();
          expect(files, artifact.manifest.name).toContain(
            `package/${artifact.pluginManifest?.entry}`,
          );
          expect(files, artifact.manifest.name).not.toEqual(
            expect.arrayContaining([expect.stringMatching(/\.d\.[cm]?ts$/)]),
          );
          expect(artifact.manifest.types).toBeUndefined();
          expect(artifact.manifest.typings).toBeUndefined();
          expect(artifact.manifest.typesVersions).toBeUndefined();
          expect(artifact.manifest.main).toBeUndefined();
          expect(artifact.manifest.exports).toEqual({
            ".": { import: "./dist/index.js" },
            "./manifest.json": "./manifest.json",
            "./package.json": "./package.json",
          });
          expect(artifact.manifest.keywords ?? []).not.toEqual(
            expect.arrayContaining(["types", "typescript"]),
          );
          expect(
            artifact.manifest.dependencies?.["@cat/plugin-core"],
          ).toBeUndefined();
          expect(
            artifact.manifest.peerDependencies?.["@cat/plugin-core"],
          ).toBeDefined();
        }
      }),
    );

    await expectSourceManifestsUnchanged();
  });

  it("typechecks the SDK and loads every runtime plugin through its installed manifest entry", async () => {
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
          name: "cat-package-artifact-consumer",
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

    await writeFile(
      join(consumer, "consumer.ts"),
      `import type { CatPlugin, ComponentData, LanguageAnalysisContext, PluginContext, PluginLogger, Token } from "@cat/plugin-core";
import { AuthFactor, FileImporter, LanguageAnalyzer, PluginManager, QAChecker, ServiceRegistry, normalizeLanguageId } from "@cat/plugin-core";
import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";

class ConsumerLanguageAnalyzer extends LanguageAnalyzer {
  getId() { return "consumer-language-analyzer"; }
  getLanguageAnalysisConfigurationAssessment() {
    return { status: "VALID" as const, supportedLanguages: [normalizeLanguageId("en-US")], semanticConfiguration: {} };
  }
  async analyze(ctx: LanguageAnalysisContext): Promise<never> { throw new Error(ctx.text); }
}

declare const plugin: CatPlugin;
const component: ComponentData = { name: "example", slot: "example", url: "example.js" };
const token: Token = { type: "text", value: "x", start: 0, end: 1 };
declare const pluginContext: PluginContext;
pluginContext.logger.error("plugin diagnostic", { code: "PLUGIN_DIAGNOSTIC" });
declare const pluginLogger: PluginLogger;
const pluginManager = PluginManager.get("GLOBAL", "", undefined, pluginLogger);
pluginManager.getDiagnosticLogger().info("host diagnostic");
const serviceRegistry = new ServiceRegistry([], pluginLogger);
const consumerAnalyzer = new ConsumerLanguageAnalyzer();
void [plugin, component, token, consumerAnalyzer, serviceRegistry, AuthFactor, FileImporter, QAChecker, createSandbox, safeCustomElements];
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
      `import { readFile } from "node:fs/promises";

const core = await import("@cat/plugin-core");
const client = await import("@cat/plugin-core/client");
if (typeof client.createSandbox !== "function" || typeof client.safeCustomElements !== "function") {
  throw new Error("Plugin Core client export is unavailable from the packed SDK");
}
const names = ${JSON.stringify(
        artifacts
          .filter((artifact) => artifact.directory.startsWith("@cat-plugin/"))
          .map((artifact) => artifact.manifest.name)
          .sort(),
      )};
const diagnostics = [];
const pluginLogger = {
  child: () => pluginLogger,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: (message, fields) => diagnostics.push({ message, fields }),
  fatal: () => undefined,
};
const serviceConstructors = [
  "AuthFactor",
  "FileExporter",
  "FileImporter",
  "LLMProvider",
  "LanguageAnalyzer",
  "QAChecker",
  "RerankProvider",
  "StorageProvider",
  "TextVectorizer",
  "Tokenizer",
  "TranslationAdvisor",
  "VectorStorage",
].map((name) => core[name]);
const plugins = new Map();
const componentCounts = new Map();
const configurationFromSchema = (schema) => {
  if (schema === null || typeof schema !== "object") return {};
  if ("default" in schema) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "array") return [configurationFromSchema(schema.items)];
  if (schema.type === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, property]) => [
        name,
        configurationFromSchema(property),
      ]),
    );
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.format === "url") return "http://127.0.0.1";
  return "package-artifact-smoke";
};
for (const name of names) {
  const manifestURL = import.meta.resolve(name + "/manifest.json");
  const manifest = JSON.parse(await readFile(new URL(manifestURL), "utf8"));
  if (typeof manifest.entry !== "string") {
    throw new Error(name + " has no installed Plugin Manifest entry");
  }
  const manifestEntryURL = new URL(manifest.entry, manifestURL).href;
  const packageEntryURL = import.meta.resolve(name);
  if (manifestEntryURL !== packageEntryURL) {
    throw new Error(name + " manifest entry differs from the package runtime entry");
  }
  const plugin = await import(manifestEntryURL);
  const packagePlugin = await import(name);
  if (Object.keys(plugin).length !== 1 || !("default" in plugin)) {
    throw new Error(name + " leaked a named plugin export");
  }
  if (plugin.default !== packagePlugin.default) {
    throw new Error(name + " package import did not resolve to its Plugin Manifest entry");
  }
  plugins.set(name, plugin);
  const components = await plugin.default.components?.({}) ?? [];
  componentCounts.set(name, components.length);
  for (const component of components) {
    const resource = await readFile(new URL(component.url, manifestURL));
    if (resource.byteLength === 0) {
      throw new Error(name + " component resource is empty: " + component.url);
    }
  }
  const services = await plugin.default.services?.({
    capabilities: {},
    config: configurationFromSchema(manifest.config),
    logger: pluginLogger,
  }) ?? [];
  for (const service of services) {
    if (!serviceConstructors.some((constructor) => service instanceof constructor)) {
      throw new Error(name + " service was not created by the host Plugin Core instance");
    }
  }
}
if (componentCounts.get("@cat-plugin/tiny-widget") !== 1) {
  throw new Error("tiny-widget component artifact was not loaded from components()");
}
if (componentCounts.get("@cat-plugin/totp-mfa-provider") !== 2) {
  throw new Error("totp component artifacts were not loaded from components()");
}
const serviceRegistry = new core.ServiceRegistry([], pluginLogger);
if (!(serviceRegistry instanceof core.ServiceRegistry)) {
  throw new Error("plugin service registry did not cross the packaged boundary");
}
const spacy = (await plugins.get("@cat-plugin/spacy-language-analyzer").default.services({
  config: { serverUrl: "http://127.0.0.1:1" },
  logger: pluginLogger,
}))[0];
const availability = await spacy.getAvailability();
if (availability.available || availability.reason !== "remote-unreachable") {
  throw new Error("spaCy availability did not cross the packaged plugin boundary");
}
console.log("isolated runtime ok");
`,
    );
    const { stdout } = await run(process.execPath, ["runtime.mjs"], {
      cwd: consumer,
      env: { ...process.env, NODE_ENV: "production" },
    });
    expect(stdout).toContain("isolated runtime ok");

    const runtimeEntrypoints = await Promise.all(
      ["test", "development", "production"].map(async (nodeEnv) =>
        (
          await run(
            process.execPath,
            [
              "--input-type=module",
              "--eval",
              `const names = ${JSON.stringify(
                artifacts
                  .filter((artifact) =>
                    artifact.directory.startsWith("@cat-plugin/"),
                  )
                  .map((artifact) => artifact.manifest.name)
                  .sort(),
              )}; const entries = await Promise.all(names.map(async (name) => { const plugin = await import(name); return { name, entry: import.meta.resolve(name), names: Object.keys(plugin) }; })); console.log(JSON.stringify(entries))`,
            ],
            {
              cwd: consumer,
              env: { ...process.env, NODE_ENV: nodeEnv },
            },
          )
        ).stdout.trim(),
      ),
    );
    expect(new Set(runtimeEntrypoints).size).toBe(1);
    for (const output of runtimeEntrypoints) {
      const entrypoints: unknown = JSON.parse(output);
      expect(entrypoints).toEqual(
        workspacePluginNames.map((name) => ({
          name,
          entry: expect.stringMatching(/node_modules\/.+\/dist\/index\.js$/),
          names: ["default"],
        })),
      );
    }
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
