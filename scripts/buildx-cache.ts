import { lstat, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export type BuildxCachePaths = {
  output?: string;
  source?: string;
};

export const buildxCacheFamilies = ["application", "spacy"] as const;

export type BuildxCacheFamily = (typeof buildxCacheFamilies)[number];

export type BuildxCacheResolution =
  | { paths: BuildxCachePaths; valid: true }
  | { message: string; paths: {}; valid: false };

export type ResolveBuildxCachePathsOptions = {
  allowedCacheRoot: string;
  cwd: string;
  output?: string;
  source?: string;
};

type BuildxCacheFileSystem = {
  lstat: typeof lstat;
  realpath: typeof realpath;
};

type PathStats = {
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

export type ValidateBuildxCachePathsOptions = ResolveBuildxCachePathsOptions & {
  families?: readonly BuildxCacheFamily[];
  fs?: BuildxCacheFileSystem;
  requireOutputMarkers?: boolean;
};

export type FinalizeBuildxFamilyCacheOptions =
  ResolveBuildxCachePathsOptions & {
    family: BuildxCacheFamily;
  };

export type ValidatedBuildxCacheResolution =
  | {
      paths: BuildxCachePaths;
      sourceScopes: Record<BuildxCacheFamily, boolean>;
      valid: true;
    }
  | { message: string; paths: {}; valid: false };

const unsafeBuildxPath = (value: string): boolean =>
  value.trim() === "" ||
  value.includes("\0") ||
  value.includes(",") ||
  value.includes("\r") ||
  value.includes("\n");

const isStrictDescendant = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate);
  return (
    path !== "" &&
    !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    path !== ".." &&
    !isAbsolute(path)
  );
};

const containsPath = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate);
  return (
    path === "" ||
    (!path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      path !== ".." &&
      !isAbsolute(path))
  );
};

export const resolveBuildxCachePaths = (
  options: ResolveBuildxCachePathsOptions,
): BuildxCacheResolution => {
  const entries = [
    ["source", options.source],
    ["output", options.output],
  ] as const;
  if (entries.every(([, value]) => value === undefined || value === "")) {
    return { paths: {}, valid: true };
  }
  const allowedCacheRoot = resolve(options.cwd, options.allowedCacheRoot);
  const resolved: BuildxCachePaths = {};
  for (const [name, value] of entries) {
    if (value === undefined || value === "") continue;
    if (unsafeBuildxPath(value)) {
      return {
        message: `${name} cache path contains an unsafe Buildx value`,
        paths: {},
        valid: false,
      };
    }
    const path = resolve(options.cwd, value);
    if (!isStrictDescendant(allowedCacheRoot, path)) {
      return {
        message: `${name} cache path must be a strict child of ${allowedCacheRoot}`,
        paths: {},
        valid: false,
      };
    }
    resolved[name] = path;
  }
  if (
    resolved.source !== undefined &&
    resolved.output !== undefined &&
    (containsPath(resolved.source, resolved.output) ||
      containsPath(resolved.output, resolved.source))
  ) {
    return {
      message: "source and output cache paths must be distinct sibling scopes",
      paths: {},
      valid: false,
    };
  }
  return { paths: resolved, valid: true };
};

const missingPath = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const lstatIfPresent = async (
  fs: BuildxCacheFileSystem,
  path: string,
): Promise<PathStats | undefined> => {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (missingPath(error)) return undefined;
    throw error;
  }
};

type PathKind = "directory" | "file";

const inspectExistingPath = async (
  fs: BuildxCacheFileSystem,
  cwd: string,
  path: string,
  kind: PathKind,
  required: boolean,
): Promise<boolean> => {
  const pathFromCwd = relative(cwd, path);
  if (pathFromCwd === "" || isAbsolute(pathFromCwd)) {
    throw new Error("cache path escapes the canonical working directory");
  }

  let current = cwd;
  const cwdStats = await fs.lstat(current);
  if (!cwdStats.isDirectory() || cwdStats.isSymbolicLink()) {
    throw new Error("canonical working directory is not a real directory");
  }

  for (const segment of pathFromCwd.split(/[\\/]/)) {
    current = join(current, segment);
    const stats = await lstatIfPresent(fs, current);
    if (stats === undefined) {
      if (required) throw new Error(`missing cache path ${path}`);
      return false;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`cache path contains a symbolic link: ${current}`);
    }
    const isFinalSegment = current === path;
    if (
      (isFinalSegment && kind === "file" && !stats.isFile()) ||
      (!isFinalSegment && !stats.isDirectory()) ||
      (isFinalSegment && kind === "directory" && !stats.isDirectory())
    ) {
      throw new Error(`cache path has an unexpected type: ${current}`);
    }
  }
  return true;
};

const invalidFilesystemResolution = (
  error: unknown,
): ValidatedBuildxCacheResolution => ({
  message:
    error instanceof Error
      ? error.message
      : "could not inspect Buildx cache filesystem paths",
  paths: {},
  valid: false,
});

export const validateBuildxCachePaths = async (
  options: ValidateBuildxCachePathsOptions,
): Promise<ValidatedBuildxCacheResolution> => {
  const fs = options.fs ?? { lstat, realpath };
  let cwd: string;
  try {
    cwd = await fs.realpath(options.cwd);
  } catch (error) {
    return invalidFilesystemResolution(error);
  }

  const paths = resolveBuildxCachePaths({ ...options, cwd });
  if (!paths.valid) return paths;
  if (paths.paths.source === undefined && paths.paths.output === undefined) {
    return {
      paths: {},
      sourceScopes: { application: false, spacy: false },
      valid: true,
    };
  }

  const allowedCacheRoot = resolve(cwd, options.allowedCacheRoot);
  if (!isStrictDescendant(cwd, allowedCacheRoot)) {
    return {
      message: `allowed cache root must be a strict child of ${cwd}`,
      paths: {},
      valid: false,
    };
  }

  try {
    await inspectExistingPath(fs, cwd, allowedCacheRoot, "directory", false);
    const sourceScopes = Object.fromEntries(
      buildxCacheFamilies.map((family) => [family, false]),
    ) as Record<BuildxCacheFamily, boolean>;
    for (const [name, path] of Object.entries(paths.paths)) {
      await inspectExistingPath(fs, cwd, path, "directory", false);
      for (const family of options.families ?? buildxCacheFamilies) {
        const scope = join(path, family);
        const exists = await inspectExistingPath(
          fs,
          cwd,
          scope,
          "directory",
          false,
        );
        const hasMarker = await inspectExistingPath(
          fs,
          cwd,
          join(scope, "index.json"),
          "file",
          options.requireOutputMarkers === true && name === "output",
        );
        if (name === "source") sourceScopes[family] = exists && hasMarker;
      }
    }
    return { paths: paths.paths, sourceScopes, valid: true };
  } catch (error) {
    return invalidFilesystemResolution(error);
  }
};

export const finalizeBuildxFamilyCache = async (
  options: FinalizeBuildxFamilyCacheOptions,
): Promise<void> => {
  const validation = await validateBuildxCachePaths({
    ...options,
    families: [options.family],
    requireOutputMarkers: true,
  });
  if (
    !validation.valid ||
    validation.paths.source === undefined ||
    validation.paths.output === undefined
  ) {
    throw new Error(
      validation.valid
        ? "Buildx cache finalization requires source and output paths"
        : validation.message,
    );
  }
  const source = join(validation.paths.source, options.family);
  const output = join(validation.paths.output, options.family);
  const previous = `${source}.previous-${process.pid}`;
  let sourceMoved = false;
  try {
    if ((await lstatIfPresent({ lstat, realpath }, previous)) !== undefined) {
      throw new Error(`Previous Buildx cache path already exists: ${previous}`);
    }
    if ((await lstatIfPresent({ lstat, realpath }, source)) !== undefined) {
      await rename(source, previous);
      sourceMoved = true;
    }
    try {
      await rename(output, source);
    } catch (error) {
      if (sourceMoved) {
        await rename(previous, source);
        sourceMoved = false;
      }
      throw error;
    }
    if (sourceMoved) {
      await rm(previous, { force: true, recursive: true });
    }
  } catch (error) {
    throw new Error(
      `Could not finalize ${options.family} Buildx cache: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};
