import type { PluginData } from "@cat/shared";
import { join } from "path";
import { z } from "zod";
import { loadPluginData } from "../plugin";
import type { PluginImporter } from "./plugin-importer-registry";

const pluginsDir = join(process.cwd(), "plugins");

const OriginSchema = z.object({
  type: z.literal("LOCAL"),
  data: z.object({
    id: z.string().min(1),
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
      data: { id },
    } = OriginSchema.parse(origin);

    const dir = join(pluginsDir, id);

    try {
      return await loadPluginData(dir);
    } catch (e) {
      throw new Error("Error when import plugin: " + e);
    }
  }
}

export const localImporter = new LocalPluginImporter();
