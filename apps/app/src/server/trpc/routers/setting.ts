import { z } from "zod";
import { authedProcedure, router } from "../server";
import type { InputJsonValue } from "@prisma/client/runtime/client";

export const settingRouter = router({
  set: authedProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.json(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { key, value } = input;
      await prisma.setting.update({
        where: {
          key,
        },
        data: {
          value: value as InputJsonValue,
        },
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .output(z.json().nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { key } = input;

      return z
        .json()
        .nullable()
        .parse(
          (
            await prisma.setting.findUnique({
              where: {
                key,
              },
              select: {
                value: true,
              },
            })
          )?.value ?? null,
        );
    }),
});
