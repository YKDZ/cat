import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

export type DevHmrProbeKind = "application" | "private-jit";

export type DevProbeWorkspace = {
  applicationSourcePath: string;
  cacheDirectory: string;
  directory: string;
  privateJitPackageRoot: string;
  privateJitSourcePath: string;
};

const moduleSource = (testId: string, value: string): string =>
  `<script setup lang="ts">\nconst value = ${JSON.stringify(value)};\n</script>\n\n<template>\n  <span data-testid="${testId}" :data-value="value" />\n</template>\n`;

const assertWorkspaceDirectory = (directory: string): void => {
  const allowedRoot = resolve(tmpdir(), "cat-e2e-probes");
  const pathFromAllowedRoot = relative(allowedRoot, directory);
  if (
    pathFromAllowedRoot === "" ||
    pathFromAllowedRoot === ".." ||
    isAbsolute(pathFromAllowedRoot) ||
    pathFromAllowedRoot.startsWith("../") ||
    pathFromAllowedRoot.startsWith("..\\")
  ) {
    throw new Error(
      "Development probe workspace must be a cell below the system temporary probe root",
    );
  }
};

export const createDevProbeWorkspace = async (
  cellId: string,
): Promise<DevProbeWorkspace> => {
  const directory = resolve(tmpdir(), "cat-e2e-probes", cellId);
  assertWorkspaceDirectory(directory);
  const applicationSourcePath = join(directory, "application-probe.vue");
  const privateJitDirectory = join(directory, "private-jit");
  const privateJitSourcePath = join(privateJitDirectory, "src/probe.vue");
  const cacheDirectory = join(directory, "optimizer-cache");
  const workspace = {
    applicationSourcePath,
    cacheDirectory,
    directory,
    privateJitPackageRoot: privateJitDirectory,
    privateJitSourcePath,
  };
  try {
    await mkdir(join(privateJitDirectory, "src"), { recursive: true });
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(
      join(privateJitDirectory, "package.json"),
      JSON.stringify({
        name: "@cat/e2e-hmr-private",
        private: true,
        type: "module",
        exports: {
          ".": {
            source: "./src/probe.vue",
            import: "./src/probe.vue",
          },
        },
      }),
    );
    await writeDevHmrProbe(workspace, "application", "application-initial");
    await writeDevHmrProbe(workspace, "private-jit", "private-initial");
    return workspace;
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
};

export const writeDevHmrProbe = async (
  workspace: DevProbeWorkspace,
  kind: DevHmrProbeKind,
  value: string,
): Promise<void> => {
  await writeFile(
    kind === "application"
      ? workspace.applicationSourcePath
      : workspace.privateJitSourcePath,
    moduleSource(
      kind === "application" ? "hmr-application" : "hmr-private-jit",
      value,
    ),
  );
};

export const removeDevProbeWorkspace = async (
  workspace: DevProbeWorkspace,
): Promise<void> => {
  await rm(workspace.directory, { force: true, recursive: true });
};
