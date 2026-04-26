import { deleteProject, executeCommand } from "@cat/domain";

import { requireTelefuncPermission } from "@/server/telefunc-auth";

export const onProjectDelete = async (projectId: string): Promise<void> => {
  const {
    drizzleDB: { client: drizzle },
  } = await requireTelefuncPermission("project", "owner", projectId);

  await executeCommand({ db: drizzle }, deleteProject, { projectId });
};
