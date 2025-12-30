import { eq, project } from "@cat/db";
import { getContext } from "telefunc";

export const onProjectDelete = async (projectId: string): Promise<void> => {
  const {
    drizzleDB: { client: drizzle },
  } = getContext();

  await drizzle.delete(project).where(eq(project.id, projectId));
};
