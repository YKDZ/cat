import { z } from "zod";
import { authedProcedure, router } from "../server";
import { TaskSchema } from "@cat/shared";

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
                    equals: z.json().parse(value) ?? {},
                  },
                }))
              : undefined,
          },
        }),
      );
    }),
});
