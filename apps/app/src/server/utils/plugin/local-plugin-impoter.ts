import type { PluginData } from "@cat/shared";
import { join } from "path";
import { z } from "zod/v4";
import { loadPluginData } from "../plugin";
import type { PluginImporter } from "./plugin-importer-registry";

const pluginsDir = join(process.cwd(), "plugins");

const OriginSchema = z.object({
  type: z.literal("LOCAL"),
  data: z.object({
    name: z.string().min(1),
  }),
});

class LocalPluginImporter implements PluginImporter {
  getOriginName(): string {
    return "LOCAL";
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
      data: { name },
    } = OriginSchema.parse(origin);

    const dir = join(pluginsDir, name);

    try {
      return await loadPluginData(dir);
    } catch (e) {
      throw new Error("Error when import plugin: " + e);
    }
  }
}

export const localImporter = new LocalPluginImporter();
