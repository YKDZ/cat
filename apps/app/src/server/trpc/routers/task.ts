import { z } from "zod";
import { authedProcedure, router } from "../server";
import { TaskSchema } from "@cat/shared";
import { cleanDanglingFilesQueue } from "@/server/processor/cleanDanglingFiles";

export const taskRouter = router({
  listProjectExportTranslatedFileTask: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
      }),
    )
    .output(z.array(TaskSchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
  triggerCleanDanglingFiles: authedProcedure.mutation(async ({ ctx }) => {
    const {
      prismaDB: { client: prisma },
    } = ctx;
    const task = await prisma.task.create({
      data: {
        type: "clean_dangling_files",
      },
    });

    await cleanDanglingFilesQueue.add(task.id, {});
  }),
});
