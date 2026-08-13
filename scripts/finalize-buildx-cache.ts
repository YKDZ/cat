import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildxCacheFamilies,
  finalizeBuildxFamilyCache,
  type BuildxCacheFamily,
} from "./buildx-cache.ts";

export const parseBuildxCacheFamily = (
  args: readonly string[],
): BuildxCacheFamily => {
  const values = args[0] === "--" ? args.slice(1) : args;
  const family = values[0];
  if (
    values.length !== 1 ||
    !buildxCacheFamilies.includes(family as BuildxCacheFamily)
  ) {
    throw new Error("Usage: finalize-buildx-cache.ts <application|spacy>");
  }
  return family as BuildxCacheFamily;
};

export const runFinalizeBuildxCache = async (
  args: readonly string[],
  cwd = process.cwd(),
): Promise<void> => {
  const family = parseBuildxCacheFamily(args);
  await finalizeBuildxFamilyCache({
    allowedCacheRoot: ".cache",
    cwd,
    family,
    output: ".cache/buildx-next",
    source: ".cache/buildx",
  });
  process.stdout.write(`container buildx-cache family=${family} finalized\n`);
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await runFinalizeBuildxCache(process.argv.slice(2));
}
