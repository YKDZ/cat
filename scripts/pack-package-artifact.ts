import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

type DependencySection = Record<string, string>;
type PackageManifest = Record<string, unknown> & {
  dependencies?: DependencySection;
  devDependencies?: DependencySection;
  imports?: Record<string, unknown>;
  name: string;
  optionalDependencies?: DependencySection;
  peerDependencies?: DependencySection;
  publishConfig?: Record<string, unknown>;
  scripts?: Record<string, string>;
  version: string;
};

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const packageRoot = process.cwd();
const destination = resolve(
  process.argv.slice(2).find((argument) => argument !== "--") ?? packageRoot,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRecord = (value: string, label: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
};

const readManifest = async (path: string): Promise<PackageManifest> => {
  const manifest = parseRecord(await readFile(path, "utf8"), path);
  if (
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  ) {
    throw new Error(`${path} must define string name and version fields`);
  }
  // The remaining fields stay unknown until their individual pack transforms validate them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return manifest as PackageManifest;
};

const readPnpmConfig = async (
  key: string,
): Promise<Record<string, unknown>> => {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["config", "get", key, "--json"],
    { cwd: repositoryRoot },
  );
  return parseRecord(stdout, `pnpm config ${key}`);
};
const defaultCatalog = await readPnpmConfig("catalog");
const namedCatalogs = await readPnpmConfig("catalogs");

const workspaceParents = ["packages", "apps", "@cat-plugin", "tools"];
const workspaceDirectories = (
  await Promise.all(
    workspaceParents.map(async (parent) => {
      const parentRoot = join(repositoryRoot, parent);
      const entries = await readdir(parentRoot, { withFileTypes: true }).catch(
        () => [],
      );
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parentRoot, entry.name));
    }),
  )
).flat();
const workspaceManifests = await Promise.all(
  workspaceDirectories.map(async (directory) =>
    readManifest(join(directory, "package.json")).catch(() => null),
  ),
);
const workspaceVersions = new Map(
  workspaceManifests.flatMap((manifest) =>
    manifest === null ? [] : [[manifest.name, manifest.version] as const],
  ),
);

const catalogVersion = (
  catalog: Record<string, unknown>,
  name: string,
  label: string,
): string => {
  const value = catalog[name];
  if (typeof value !== "string") {
    throw new Error(`Missing ${label} catalog entry for ${name}`);
  }
  return value;
};

const resolveDependencyRange = (name: string, range: string): string => {
  if (range === "catalog:") {
    return catalogVersion(defaultCatalog, name, "default");
  }
  if (range.startsWith("catalog:")) {
    const catalogName = range.slice("catalog:".length);
    const catalog = namedCatalogs[catalogName];
    if (!isRecord(catalog)) throw new Error(`Missing catalog ${catalogName}`);
    return catalogVersion(catalog, name, catalogName);
  }
  if (range.startsWith("workspace:")) {
    const version = workspaceVersions.get(name);
    if (version === undefined) {
      throw new Error(`Cannot resolve workspace version for ${name}`);
    }
    return version;
  }
  if (range.startsWith("link:")) {
    throw new Error(
      `Publishable package artifact dependency ${name} cannot use ${range}`,
    );
  }
  return range;
};

function cleanDependencySection(
  dependencies: DependencySection,
): DependencySection;
function cleanDependencySection(dependencies: undefined): undefined;
function cleanDependencySection(
  dependencies: DependencySection | undefined,
): DependencySection | undefined {
  return dependencies === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(dependencies).map(([name, range]) => [
          name,
          resolveDependencyRange(name, range),
        ]),
      );
}

const sourceManifest = await readManifest(join(packageRoot, "package.json"));
const stageRoot = await mkdtemp(join(tmpdir(), "cat-package-artifact-"));
const stagePackageRoot = join(stageRoot, "package");

try {
  await cp(join(packageRoot, "dist"), join(stagePackageRoot, "dist"), {
    recursive: true,
  });
  await Promise.all(
    ["manifest.json", "LICENSE", "README.md"].map(async (file) => {
      const source = join(packageRoot, file);
      if (await stat(source).catch(() => null)) {
        await cp(source, join(stagePackageRoot, file));
      }
    }),
  );

  const cleanManifest: PackageManifest = {
    ...sourceManifest,
    ...(sourceManifest.publishConfig ?? {}),
    ...(sourceManifest.dependencies === undefined
      ? {}
      : {
          dependencies: cleanDependencySection(sourceManifest.dependencies),
        }),
    ...(sourceManifest.optionalDependencies === undefined
      ? {}
      : {
          optionalDependencies: cleanDependencySection(
            sourceManifest.optionalDependencies,
          ),
        }),
    ...(sourceManifest.peerDependencies === undefined
      ? {}
      : {
          peerDependencies: cleanDependencySection(
            sourceManifest.peerDependencies,
          ),
        }),
  };
  delete cleanManifest.devDependencies;
  delete cleanManifest.publishConfig;
  delete cleanManifest.scripts;
  if (
    cleanManifest.imports &&
    Object.keys(cleanManifest.imports).length === 0
  ) {
    delete cleanManifest.imports;
  }
  for (const section of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    const dependencies = cleanManifest[section];
    if (dependencies === undefined || Object.keys(dependencies).length === 0) {
      delete cleanManifest[section];
    }
  }

  await writeFile(
    join(stagePackageRoot, "package.json"),
    `${JSON.stringify(cleanManifest, null, 2)}\n`,
  );

  if (process.env.CAT_PACK_INDUCE_FAILURE === "1") {
    throw new Error("Induced package artifact staging failure");
  }

  const { stdout } = await execFileAsync(
    "pnpm",
    ["pack", "--pack-destination", destination, "--json"],
    { cwd: stagePackageRoot },
  );
  const result = parseRecord(
    stdout.slice(stdout.indexOf("{")),
    "pnpm pack output",
  );
  if (typeof result.filename !== "string") {
    throw new Error("pnpm pack output did not include a filename");
  }
  process.stdout.write(
    `${JSON.stringify({ ...result, filename: resolve(result.filename) })}\n`,
  );
} finally {
  await rm(stageRoot, { force: true, recursive: true });
}
