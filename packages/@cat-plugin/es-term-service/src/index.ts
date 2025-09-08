import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { getESTermService } from "./service";
import { z } from "zod";

export const ConfigSchema = z
  .object({
    connection: z.object({
      url: z.url(),
      username: z.string(),
      password: z.string(),
    }),
  })
  .optional();

export type Config = z.infer<typeof ConfigSchema>;

class Plugin implements CatPlugin {
  async onLoaded() {}
  getTermServices(options: PluginGetterOptions) {
    return [getESTermService(ConfigSchema.parse(options.configs))];
  }
}

const plugin = new Plugin();

export default plugin;
