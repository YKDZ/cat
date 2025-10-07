import * as z from "zod/v4";
import { TaskSchema } from "@cat/shared/schema/drizzle/misc";
import { authedProcedure, router } from "@/trpc/server.ts";

export const taskRouter = router({
  get: authedProcedure
    .input(
      z.object({
        type: z.string(),
        projectId: z.uuid(),
      }),
    )
    .output(z.array(TaskSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { type, projectId } = input;

      return await drizzle.query.task.findMany({
        where: (task, { and, eq, sql }) =>
          and(
            eq(task.type, type),
            sql`("meta" ->> 'projectId') = ${projectId}`,
          ),
      });
    }),
});
