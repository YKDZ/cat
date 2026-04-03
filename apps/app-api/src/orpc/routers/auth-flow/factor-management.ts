import * as z from "zod/v4";

import { authed } from "@/orpc/server";

const FactorInfoSchema = z.object({
  dbId: z.int(),
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

    return pluginManager
      .getServices("AUTH_FACTOR")
      .map(({ dbId, id, service }) => {
        return {
          dbId,
          id,
          name: service.getName(),
          icon: service.getIcon(),
          aal: service.getAal(),
          componentType: service.getClientComponentType(),
        };
      });
  });
