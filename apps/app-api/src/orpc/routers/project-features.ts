import {
  executeCommand,
  updateProjectFeatures,
  UpdateProjectFeaturesCommandSchema,
} from "@cat/domain";
import { ProjectSchema } from "@cat/shared";

import { authed, checkPermission } from "@/orpc/server";

/** Update project feature flags (issues, pullRequests) */
export const updateFeatures = authed
  .input(UpdateProjectFeaturesCommandSchema)
  .use(checkPermission("project", "admin"), (i) => i.projectId)
  .output(ProjectSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updateProjectFeatures, input);
  });
