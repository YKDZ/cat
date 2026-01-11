import type { CatPlugin, PluginContext } from "@cat/plugin-core";
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
  services(ctx: PluginContext) {
    return [new Provider(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
