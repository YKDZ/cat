import { deleteProject, executeCommand } from "@cat/domain";
import { getContext } from "telefunc";

export const onProjectDelete = async (projectId: string): Promise<void> => {
  const {
    drizzleDB: { client: drizzle },
  } = getContext();

  await executeCommand({ db: drizzle }, deleteProject, { projectId });
};
