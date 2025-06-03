import {
  PluginData,
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared";
import { readFile } from "fs/promises";
import { join } from "path";

export const loadPluginData = async (dir: string): Promise<PluginData> => {
  const manifestPath = join(dir, "manifest.json");
  const packageDotJsonPath = join(dir, "package.json");
  const readmePath = join(dir, "README.md");

  const rawManifest = await readFile(manifestPath, "utf-8");
  const rawREADME = await readFile(readmePath, "utf-8").catch(() => null);

  const manifest = PluginManifestSchema.parse(JSON.parse(rawManifest));

  const { name, version } = JSON.parse(
    await readFile(packageDotJsonPath, "utf-8"),
  );

  return PluginDataSchema.parse({
    ...manifest,
    name,
    version,
    overview: rawREADME,
  });
};
