import * as z from "zod/v4";
import { TaskSchema } from "@cat/shared/schema/prisma/misc";
import { authedProcedure, router } from "@/trpc/server.ts";

export const taskRouter = router({
  get: authedProcedure
    .input(
      z.object({
        type: z.string().optional(),
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

      return await prisma.task.findMany({
        where: {
          type,
          AND: meta
            ? meta.map(({ path, value }) => ({
                meta: {
                  path,
                  equals: z.json().parse(value) ?? {},
                },
              }))
            : undefined,
        },
      });
    }),
});
