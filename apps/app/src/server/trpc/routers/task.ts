import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { TaskSchema } from "@cat/shared";
import { prisma } from "@cat/db";

export const taskRouter = router({
  listProjectExportTranslatedFileTask: authedProcedure
    .input(
      z.object({
        projectId: z.cuid2(),
      }),
    )
    .output(z.array(TaskSchema))
    .query(async ({ input }) => {
      const { projectId } = input;

      return z.array(TaskSchema).parse(
        await prisma.task.findMany({
          where: {
            meta: {
              path: ["projectId"],
              equals: projectId,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
      );
    }),
});
