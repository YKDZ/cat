import { PluginData } from "@cat/shared";
import { randomUUID } from "crypto";
import { copy, remove } from "fs-extra/esm";
import { join } from "path";
import { z } from "zod/v4";
import { loadPluginData } from "../plugin";
import { downloadAndExtract } from "../tar";
import { PluginImporter } from "./plugin-importer-registry";

const pluginsDir = join(process.cwd(), "plugins");

const OriginSchema = z.object({
  type: z.literal("TAR_GZ_URL"),
  data: z.object({
    url: z.url(),
  }),
});

class TarGZUrlPluginImporter implements PluginImporter {
  getOriginName(): string {
    return "TAR_GZ_URL";
  }

  canImportPlugin(origin: Record<string, unknown>): boolean {
    try {
      OriginSchema.parse(origin);
      return true;
    } catch {
      return false;
    }
  }

  async importPlugin(origin: Record<string, unknown>): Promise<PluginData> {
    const {
      data: { url },
    } = OriginSchema.parse(origin);

    const tempId = `tempId_${randomUUID()}`;
    const tempDir = join(pluginsDir, tempId);

    try {
      await downloadAndExtract(url, tempDir);

      const data = await loadPluginData(tempDir);
      const newDir = join(pluginsDir, data.id);

      await copy(tempDir, newDir, { overwrite: true, dereference: true });
      await remove(tempDir);

      return data;
    } catch (e) {
      await remove(tempDir);
      throw new Error("Error when import plugin: " + e);
    }
  }
}

export const tarGZURLImporter = new TarGZUrlPluginImporter();
