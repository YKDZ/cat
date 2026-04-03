import type { CatPlugin, ComponentData, PluginContext } from "@cat/plugin-core";

import { TotpFactor } from "./factor.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new TotpFactor(ctx.capabilities)];
  }

  components() {
    return [
      {
        name: "user-verify-totp",
        slot: "mfa-verify-totp",
        url: "dist/user-verify-totp.js",
      } satisfies ComponentData,
      {
        name: "user-init-totp",
        slot: "mfa-init-totp",
        url: "dist/user-init-totp.js",
      } satisfies ComponentData,
    ];
  }
}

const plugin = new Plugin();

export default plugin;
