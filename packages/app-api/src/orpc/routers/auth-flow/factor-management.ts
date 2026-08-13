import * as z from "zod";

import { authed } from "#/orpc/server.ts";

const FactorInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  aal: z.union([z.literal(1), z.literal(2)]),
  componentType: z.string(),
});

/**
 * List all available AUTH_FACTOR services for the current scope.
 * Used by the frontend to display available login methods / MFA options.
 */
export const listFactors = authed
  .output(z.array(FactorInfoSchema))
  .handler(async ({ context }) => {
    const { pluginManager } = context;

    return pluginManager.getServices("AUTH_FACTOR").map(({ id, service }) => {
      return {
        id,
        name: service.getName(),
        icon: service.getIcon(),
        aal: service.getAal(),
        componentType: service.getClientComponentType(),
      };
    });
  });
