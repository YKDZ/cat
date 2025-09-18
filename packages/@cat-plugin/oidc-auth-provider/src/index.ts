import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import * as z from "zod/v4";
import { Provider } from "./provider.ts";

export const ProviderConfigSchema = z.object({
  displayName: z.string(),
  scopes: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  issuer: z.string(),
  authURI: z.url(),
  tokenURI: z.url(),
  userInfoURI: z.url(),
  logoutURI: z.url(),
  jwksURI: z.url(),
});

export const ConfigSchema = z.array(ProviderConfigSchema);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

class Plugin implements CatPlugin {
  async onLoaded() {}

  getAuthProviders(options: PluginGetterOptions) {
    return ConfigSchema.parse(options.config).map(
      (config) => new Provider(config),
    );
  }
}

const plugin = new Plugin();

export default plugin;
