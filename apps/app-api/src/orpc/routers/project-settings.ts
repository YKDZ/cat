import {
  executeCommand,
  executeQuery,
  getProject,
  getProjectSettings,
  updateProjectSettings,
} from "@cat/domain";
import {
  ProjectSettingPatchSchema,
  ProjectSettingPayloadSchema,
} from "@cat/shared/schema/project-setting";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";

export const get = authed
  .input(z.object({ projectId: z.uuidv4() }))
  .use(checkPermission("project", "viewer"), () => "*")
  .output(ProjectSettingPayloadSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return executeQuery({ db }, getProjectSettings, {
      projectId: input.projectId,
    });
  });

export const update = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      patch: ProjectSettingPatchSchema,
    }),
  )
  .use(checkPermission("project", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;

    if (input.patch.enableAutoTranslation === true) {
      const projectRow = await executeQuery({ db }, getProject, {
        projectId: input.projectId,
      });

      if (!projectRow?.features?.pullRequests) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message:
            "Cannot enable auto-translation: Pull Request features must be enabled first",
        });
      }
    }

    return executeCommand({ db }, updateProjectSettings, {
      projectId: input.projectId,
      patch: input.patch,
    });
  });
