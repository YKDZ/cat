import * as z from "zod/v4";
import { safeZDotJson } from "@cat/shared/schema/json";
import { authedProcedure, router } from "../server.ts";

export const settingRouter = router({
  set: authedProcedure
    .input(
      z.array(
        z.object({
          key: z.string(),
          value: z.json(),
        }),
      ),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const arr = input;

      await prisma.$transaction(async (tx) => {
        for (const item of arr) {
          const { key, value } = item;
          await tx.setting.update({
            where: { key },
            data: { value: z.json().parse(value) ?? {} },
          });
        }
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .output(safeZDotJson.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { key } = input;

      return (
        (
          await prisma.setting.findUnique({
            where: {
              key,
            },
            select: {
              value: true,
            },
          })
        )?.value ?? null
      );
    }),
});
