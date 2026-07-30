import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type WorkspacePackage = {
  manifestPath: string;
  manifest: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  sourceImports?: string[];
  tags: string[];
};

const approvedDatabaseConsumers = new Set([
  "@cat/app",
  "@cat/app-e2e",
  "@cat/domain",
  "@cat/eval",
  "@cat/seed",
  "@cat/test-utils",
  "@tools/seeder",
]);

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const deniedDependencyRoles = new Map<string, readonly string[]>([
  ["application", ["application", "tool"]],
  ["browser", ["database", "server"]],
  [
    "database",
    ["application", "browser", "plugin", "test-infrastructure", "tool"],
  ],
  [
    "isomorphic",
    [
      "application",
      "browser",
      "database",
      "plugin",
      "server",
      "test-infrastructure",
      "tool",
    ],
  ],
  ["library", ["application"]],
  ["plugin", ["application", "database", "test-infrastructure", "tool"]],
  ["product-runtime", ["data-tool", "test-infrastructure", "tool"]],
  [
    "public-sdk",
    ["application", "database", "data-tool", "test-infrastructure", "tool"],
  ],
  ["server", ["browser"]],
  ["test-infrastructure", ["application", "plugin"]],
  ["tool", ["application", "browser", "plugin", "test-infrastructure"]],
]);

const workspaceImportPatterns = [
  /\b(?:import|export)\s+(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

export const extractWorkspaceImports = (
  source: string,
  packageNames: ReadonlySet<string>,
): string[] => {
  const orderedNames = [...packageNames].sort(
    (left, right) => right.length - left.length,
  );
  const imports = new Set<string>();
  for (const pattern of workspaceImportPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const packageName = orderedNames.find(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      );
      if (packageName !== undefined) imports.add(packageName);
    }
  }
  return [...imports].sort();
};

const hasTypeScriptSourceExport = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.endsWith(".ts") && !value.endsWith(".d.ts");
  }
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some(hasTypeScriptSourceExport);
};

export const auditWorkspacePackages = (
  packages: WorkspacePackage[],
): string[] => {
  const errors: string[] = [];
  const packageTags = new Map(
    packages.flatMap(({ manifest, tags }) =>
      manifest.name === undefined
        ? []
        : [[manifest.name, new Set(tags)] as const],
    ),
  );
  const workspaceDependencies = new Map(
    packages.flatMap(({ manifest, sourceImports }) => {
      if (manifest.name === undefined) return [];
      const dependencies = new Set([
        ...dependencySections.flatMap((section) =>
          Object.keys(manifest[section] ?? {}),
        ),
        ...(sourceImports ?? []),
      ]);
      return [[manifest.name, [...dependencies]] as const];
    }),
  );
  const reachesDatabase = (
    packageName: string,
    visited = new Set<string>(),
  ): boolean => {
    if (visited.has(packageName)) return false;
    visited.add(packageName);
    return (workspaceDependencies.get(packageName) ?? []).some(
      (dependency) =>
        dependency === "@cat/db" || reachesDatabase(dependency, visited),
    );
  };
  const privateJitPackages = new Set(
    packages
      .filter(({ manifest }) => {
        const candidate = manifest as WorkspacePackage["manifest"] & {
          private?: boolean;
          exports?: unknown;
        };
        return (
          candidate.private === true &&
          hasTypeScriptSourceExport(candidate.exports)
        );
      })
      .map(({ manifest }) => manifest.name)
      .filter((name): name is string => name !== undefined),
  );

  for (const workspacePackage of packages) {
    const { manifest, manifestPath, tags } = workspacePackage;
    const packageName = manifest.name ?? relative(process.cwd(), manifestPath);
    if (tags.length === 0) {
      errors.push(`${packageName} has no Turbo boundary classification`);
    }

    const rolePairs: ReadonlyArray<readonly [string, string, string]> = [
      ["browser", "server", "browser and server roles are mutually exclusive"],
      [
        "browser",
        "database",
        "browser and database roles are mutually exclusive",
      ],
      [
        "application",
        "library",
        "application and library roles are mutually exclusive",
      ],
      [
        "application",
        "tool",
        "application and tool roles are mutually exclusive",
      ],
      [
        "public-sdk",
        "application",
        "public SDK and application roles are mutually exclusive",
      ],
      [
        "public-sdk",
        "test-infrastructure",
        "public SDK and test-infrastructure roles are mutually exclusive",
      ],
      [
        "public-sdk",
        "data-tool",
        "public SDK and data-tool roles are mutually exclusive",
      ],
    ];
    for (const [left, right, description] of rolePairs) {
      if (tags.includes(left) && tags.includes(right)) {
        errors.push(`${packageName} ${description}`);
      }
    }
    if (tags.includes("database-consumer") && !tags.includes("database-path")) {
      errors.push(
        `${packageName} database-consumer role must also declare database-path`,
      );
    }
    if (tags.includes("tool") && !tags.includes("data-tool")) {
      errors.push(`${packageName} tool role must also declare data-tool`);
    }

    const ownTags = packageTags.get(packageName) ?? new Set(tags);
    const dependencyNames = workspaceDependencies.get(packageName) ?? [];
    for (const dependencyName of dependencyNames) {
      const dependencyTags = packageTags.get(dependencyName);
      if (dependencyTags === undefined) continue;
      for (const sourceRole of ownTags) {
        for (const targetRole of deniedDependencyRoles.get(sourceRole) ?? []) {
          if (dependencyTags.has(targetRole)) {
            errors.push(
              `${packageName} ${sourceRole} role cannot depend on ${targetRole} package ${dependencyName}`,
            );
          }
        }
      }
    }

    if (
      packageName !== "@cat/db" &&
      reachesDatabase(packageName) &&
      !ownTags.has("database-path")
    ) {
      errors.push(
        `${packageName} reaches @cat/db transitively but is missing the database-path Turbo tag`,
      );
    }

    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ] as const) {
      for (const [dependencyName, specifier] of Object.entries(
        manifest[section] ?? {},
      )) {
        if (
          privateJitPackages.has(dependencyName) &&
          !specifier.startsWith("link:")
        ) {
          errors.push(
            `${packageName} must link private JIT dependency ${dependencyName} from ${section}`,
          );
        }
      }
    }

    const databaseSections = dependencySections.filter(
      (section) => manifest[section]?.["@cat/db"] !== undefined,
    );
    const importsDatabase =
      workspacePackage.sourceImports?.includes("@cat/db") ?? false;
    if (databaseSections.length === 0 && !importsDatabase) continue;

    if (!approvedDatabaseConsumers.has(packageName)) {
      errors.push(
        importsDatabase
          ? `${packageName} imports @cat/db but is not an approved database consumer`
          : `${packageName} declares @cat/db in ${databaseSections.join(", ")} but is not an approved database consumer`,
      );
    }
    if (!tags.includes("database-consumer")) {
      errors.push(
        `${packageName} declares @cat/db without the database-consumer Turbo tag`,
      );
    }
    if (!tags.includes("database-path")) {
      errors.push(
        `${packageName} declares @cat/db outside the Turbo database path`,
      );
    }
  }

  const actualConsumers = packages
    .filter(({ manifest }) =>
      dependencySections.some(
        (section) => manifest[section]?.["@cat/db"] !== undefined,
      ),
    )
    .map(({ manifest }) => manifest.name)
    .filter((name): name is string => name !== undefined)
    .sort();
  const expectedConsumers = [...approvedDatabaseConsumers].sort();
  if (actualConsumers.join("\n") !== expectedConsumers.join("\n")) {
    errors.push(
      `@cat/db consumers must be exactly: ${expectedConsumers.join(", ")}; found: ${actualConsumers.join(", ")}`,
    );
  }

  return errors;
};

const workspaceRoots = ["packages", "apps", "@cat-plugin", "tools"];

type NativeCommandResult = {
  error?: Error;
  signal: NodeJS.Signals | null;
  status: number | null;
};

type NativeCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: "inherit" },
) => NativeCommandResult;

export const runNativeTurboBoundaries = (
  workspaceRoot: string,
  runCommand: NativeCommandRunner = spawnSync,
): void => {
  const result = runCommand(
    process.execPath,
    [
      resolve(workspaceRoot, "node_modules", "turbo", "bin", "turbo"),
      "boundaries",
      "--no-color",
    ],
    { cwd: workspaceRoot, stdio: "inherit" },
  );
  if (result.error !== undefined) throw result.error;
  if (result.signal !== null) {
    throw new Error(`turbo boundaries terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`turbo boundaries exited with status ${result.status}`);
  }
};

export const loadWorkspacePackages = (
  workspaceRoot: string,
): WorkspacePackage[] => {
  const packages = workspaceRoots.flatMap((root) => {
    const absoluteRoot = resolve(workspaceRoot, root);
    return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap(
      (entry) => {
        if (!entry.isDirectory()) return [];
        const packageDirectory = join(absoluteRoot, entry.name);
        const manifestPath = join(packageDirectory, "package.json");
        if (!existsSync(manifestPath)) return [];
        const turboPath = join(packageDirectory, "turbo.json");
        const tags = existsSync(turboPath)
          ? ((
              JSON.parse(readFileSync(turboPath, "utf8")) as { tags?: string[] }
            ).tags ?? [])
          : [];
        return [
          {
            packageDirectory,
            manifestPath,
            manifest: JSON.parse(
              readFileSync(manifestPath, "utf8"),
            ) as WorkspacePackage["manifest"],
            tags,
          },
        ];
      },
    );
  });
  const packageNames = new Set(
    packages
      .map(({ manifest }) => manifest.name)
      .filter((name): name is string => name !== undefined),
  );
  const ignoredDirectories = new Set([".turbo", "dist", "node_modules"]);
  const sourceExtensions = /\.(?:[cm]?[jt]sx?|vue)$/;
  return packages.map(({ packageDirectory, ...workspacePackage }) => {
    const imports = new Set<string>();
    const directories = [packageDirectory];
    while (directories.length > 0) {
      const directory = directories.pop();
      if (directory === undefined) break;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirectories.has(entry.name)) directories.push(path);
        } else if (entry.isFile() && sourceExtensions.test(entry.name)) {
          for (const dependency of extractWorkspaceImports(
            readFileSync(path, "utf8"),
            packageNames,
          )) {
            imports.add(dependency);
          }
        }
      }
    }
    return { ...workspacePackage, sourceImports: [...imports].sort() };
  });
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) ===
    resolve(dirname(import.meta.filename), "workspace-boundaries.ts");

if (isDirectExecution) {
  runNativeTurboBoundaries(process.cwd());
  const errors = auditWorkspacePackages(loadWorkspacePackages(process.cwd()));
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}
