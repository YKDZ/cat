import { z } from "zod";
import { authedProcedure, router } from "../server";
import { TaskSchema } from "@cat/shared";
import { cleanDanglingFilesQueue } from "@/server/processor/cleanDanglingFiles";
import type { InputJsonValue } from "@prisma/client/runtime/client";

export const taskRouter = router({
  query: authedProcedure
    .input(
      z.object({
        type: z.string(),
        meta: z
          .array(
            z.object({
              path: z.array(z.string()),
              value: z.json(),
            }),
          )
          .optional(),
      }),
    )
    .output(z.array(TaskSchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { type, meta } = input;

      return z.array(TaskSchema).parse(
        await prisma.task.findMany({
          where: {
            type,
            AND: meta
              ? meta.map(({ path, value }) => ({
                  meta: {
                    path,
                    equals: value as InputJsonValue,
                  },
                }))
              : undefined,
          },
        }),
      );
    }),
  triggerCleanDanglingFiles: authedProcedure
    .output(z.void())
    .mutation(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const task = await prisma.task.create({
        data: {
          type: "clean_dangling_files",
        },
      });

      await cleanDanglingFilesQueue.add(
        task.id,
        {},
        {
          jobId: task.id,
        },
      );
    }),
});
